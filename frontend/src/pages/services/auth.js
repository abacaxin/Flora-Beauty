// ── Serviço de Autenticação Flora Boutique ────────────────────────────────
// Centraliza cadastro, login, logout e leitura do perfil/role do usuário.
// Qualquer página que precise de auth importa só daqui.

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// Traduz os códigos de erro do Firebase Auth para mensagens em PT-BR
export function traduzErroAuth(codigo) {
  const mapa = {
    "auth/email-already-in-use": "Esse e-mail já está cadastrado. Tente fazer login.",
    "auth/invalid-email": "E-mail inválido. Verifique e tente novamente.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta. Tente novamente.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente de novo.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    "auth/requires-recent-login": "Por segurança, confirme sua senha atual para continuar.",
    "auth/popup-closed-by-user": "Login cancelado.",
    "auth/cancelled-popup-request": "Login cancelado.",
    "auth/account-exists-with-different-credential": "Esse e-mail já está cadastrado com senha. Faça login com e-mail e senha."
  };
  return mapa[codigo] || "Ocorreu um erro inesperado. Tente novamente.";
}

/**
 * Cria uma conta nova e o documento de perfil no Firestore.
 * @param {string} nome
 * @param {string} email
 * @param {string} senha
 * @param {{cnpj?: string, razaoSocial?: string, provavelMEI?: boolean|null, porteEmpresa?: string|null}} [dadosRevendedor] - se informado, a conta nasce como revendedor pendente de aprovação.
 */
export async function cadastrarUsuario(nome, email, senha, dadosRevendedor = null) {
  const credencial = await createUserWithEmailAndPassword(auth, email, senha);
  const usuario = credencial.user;

  await updateProfile(usuario, { displayName: nome });

  // Documento de perfil — TODA conta nova nasce com role "cliente"
  // (o "role" é só admin/cliente, separado de "tipoConta" abaixo).
  // Promover alguém a "admin" só pode ser feito manualmente no Firebase
  // Console ou via Cloud Function administrativa (nunca pelo cliente).
  const dadosPerfil = {
    nome,
    email,
    role: "cliente",
    tipoConta: dadosRevendedor ? "revendedor" : "cliente",
    criadoEm: serverTimestamp()
  };

  if (dadosRevendedor) {
    dadosPerfil.cnpj = dadosRevendedor.cnpj;
    dadosPerfil.razaoSocial = dadosRevendedor.razaoSocial;
    // Resultado (informativo) da consulta pública à BrasilAPI feita no
    // momento do cadastro — ajuda o admin a decidir a aprovação, mas
    // NUNCA é usado como trava de segurança por si só.
    dadosPerfil.provavelMEI = dadosRevendedor.provavelMEI ?? null;
    dadosPerfil.porteEmpresa = dadosRevendedor.porteEmpresa ?? null;
    // Toda conta de revendedor nasce pendente — só o admin aprova
    // manualmente depois de confirmar que é uma loja de verdade.
    dadosPerfil.statusRevendedor = "pendente";
  }

  await setDoc(doc(db, "usuarios", usuario.uid), dadosPerfil);

  // Manda o e-mail de verificação automaticamente. Se isso falhar (rede
  // instável, por exemplo), não impede a conta de ter sido criada — a
  // pessoa pode pedir reenvio depois pela tela de login.
  try {
    await sendEmailVerification(usuario);
  } catch (erro) {
    console.error("Não foi possível enviar o e-mail de verificação agora:", erro);
  }

  return usuario;
}

/**
 * Reenvia o e-mail de verificação para o usuário logado atualmente.
 */
export async function reenviarVerificacaoEmail(usuario) {
  await sendEmailVerification(usuario);
}

/**
 * Faz login (ou cadastro automático, se for a primeira vez) usando a
 * conta Google da pessoa. Contas criadas assim já chegam com o e-mail
 * verificado, porque o próprio Google já confirmou aquele e-mail.
 */
export async function loginComGoogle() {
  const provedor = new GoogleAuthProvider();
  const credencial = await signInWithPopup(auth, provedor);
  const usuario = credencial.user;

  // Se é a primeira vez dessa conta no nosso site, cria o documento de
  // perfil — do contrário, mantém o que já existia (não sobrescreve role,
  // tipoConta, etc. de uma conta já existente).
  const ref = doc(db, "usuarios", usuario.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      nome: usuario.displayName || "Cliente",
      email: usuario.email,
      role: "cliente",
      tipoConta: "cliente",
      criadoEm: serverTimestamp()
    });
  }

  return usuario;
}

/**
 * Atualiza dados do perfil (nome, telefone, fotoURL) no Firestore e,
 * quando aplicável, também no próprio Firebase Auth (nome/foto).
 * @param {import("https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js").User} usuario
 * @param {{nome?: string, telefone?: string, fotoURL?: string}} dados
 */
export async function atualizarPerfil(usuario, dados) {
  const atualizacoesAuth = {};
  if (dados.nome !== undefined) atualizacoesAuth.displayName = dados.nome;
  if (dados.fotoURL !== undefined) atualizacoesAuth.photoURL = dados.fotoURL || null;

  if (Object.keys(atualizacoesAuth).length > 0) {
    await updateProfile(usuario, atualizacoesAuth);
  }

  const ref = doc(db, "usuarios", usuario.uid);
  await updateDoc(ref, {
    ...dados,
    atualizadoEm: serverTimestamp()
  });
}

/**
 * Troca a senha do usuário logado. Por exigência do Firebase, é preciso
 * reautenticar com a senha atual antes de definir a nova.
 */
export async function alterarSenha(usuario, senhaAtual, novaSenha) {
  const credencial = EmailAuthProvider.credential(usuario.email, senhaAtual);
  await reauthenticateWithCredential(usuario, credencial);
  await updatePassword(usuario, novaSenha);
}

/**
 * Faz login com e-mail e senha.
 */
export async function loginUsuario(email, senha) {
  const credencial = await signInWithEmailAndPassword(auth, email, senha);
  return credencial.user;
}

/**
 * Indica se a conta logada (criada por e-mail/senha) já confirmou o
 * e-mail. Contas criadas via Google sempre retornam true, porque o
 * Google já garante que aquele e-mail é real e pertence à pessoa.
 */
export function emailEstaVerificado(usuario) {
  return usuario.emailVerified === true;
}

/**
 * Faz logout do usuário atual.
 */
export async function logoutUsuario() {
  await signOut(auth);
}

/**
 * Busca o perfil completo (incluindo role) do Firestore para um uid.
 */
export async function buscarPerfil(uid) {
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Observa o estado de autenticação. Chama o callback com
 * { usuario, perfil } sempre que o login mudar (inclusive null/null).
 */
export function observarAuth(callback) {
  return onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
      callback({ usuario: null, perfil: null });
      return;
    }
    const perfil = await buscarPerfil(usuario.uid);
    callback({ usuario, perfil });
  });
}

/**
 * Protege uma página: redireciona para login.html se não estiver autenticado.
 * Retorna { usuario, perfil } quando autenticado.
 */
export function exigirLogin(aoAutenticar, caminhoLogin = "./login.html") {
  return observarAuth(({ usuario, perfil }) => {
    if (!usuario) {
      window.location.href = caminhoLogin;
      return;
    }
    aoAutenticar({ usuario, perfil });
  });
}

/**
 * Protege uma página de admin: redireciona se não for admin.
 */
export function exigirAdmin(aoAutenticar, caminhoSemPermissao = "./index.html") {
  return observarAuth(({ usuario, perfil }) => {
    if (!usuario || !perfil || perfil.role !== "admin") {
      window.location.href = caminhoSemPermissao;
      return;
    }
    aoAutenticar({ usuario, perfil });
  });
}
