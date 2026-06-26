import { exigirLogin, atualizarPerfil, alterarSenha, logoutUsuario, traduzErroAuth } from "../services/auth.js";
import { db } from "../services/firebase-config.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let usuarioAtual = null;

// ── Elementos ───────────────────────────────────────────────────────────
const avatarImg = document.getElementById("perfil-avatar-img");
const avatarIniciais = document.getElementById("perfil-avatar-iniciais");
const nomeTitulo = document.getElementById("perfil-nome-titulo");
const emailTitulo = document.getElementById("perfil-email-titulo");

const tabs = document.querySelectorAll(".perfil-tab-btn");
const paineis = document.querySelectorAll(".perfil-painel");

const formDados = document.getElementById("form-dados");
const campoNome = document.getElementById("campo-nome");
const campoEmail = document.getElementById("campo-email");
const campoTelefone = document.getElementById("campo-telefone");
const campoFoto = document.getElementById("campo-foto");
const btnSalvarDados = document.getElementById("btn-salvar-dados");
const msgDados = document.getElementById("msg-dados");

const formSenha = document.getElementById("form-senha");
const campoSenhaAtual = document.getElementById("campo-senha-atual");
const campoSenhaNova = document.getElementById("campo-senha-nova");
const campoSenhaConfirma = document.getElementById("campo-senha-confirma");
const btnSalvarSenha = document.getElementById("btn-salvar-senha");
const msgSenha = document.getElementById("msg-senha");
const btnLogout = document.getElementById("btn-logout");

const formEndereco = document.getElementById("form-endereco");
const campoCep = document.getElementById("campo-cep");
const campoEndereco = document.getElementById("campo-endereco");
const campoCidadeUf = document.getElementById("campo-cidade-uf");
const campoComplemento = document.getElementById("campo-complemento");
const btnSalvarEndereco = document.getElementById("btn-salvar-endereco");
const msgEndereco = document.getElementById("msg-endereco");

// ── Helpers de mensagem ─────────────────────────────────────────────────
function mostrarMsg(el, texto, tipo = "erro") {
  el.textContent = texto;
  el.classList.toggle("sucesso", tipo === "sucesso");
}

// ── Abas ────────────────────────────────────────────────────────────────
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    paineis.forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`painel-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Avatar (iniciais ou imagem) ──────────────────────────────────────────
function gerarIniciais(nome) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] || "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function atualizarAvatar(nome, fotoURL) {
  if (fotoURL) {
    avatarImg.src = fotoURL;
    avatarImg.style.display = "block";
    avatarIniciais.style.display = "none";
    avatarImg.onerror = () => {
      // Link inválido ou imagem fora do ar: volta pras iniciais.
      avatarImg.style.display = "none";
      avatarIniciais.style.display = "flex";
    };
  } else {
    avatarImg.style.display = "none";
    avatarIniciais.style.display = "flex";
    avatarIniciais.textContent = gerarIniciais(nome);
  }
}

// ── Máscara simples de telefone BR ───────────────────────────────────────
campoTelefone.addEventListener("input", () => {
  let v = campoTelefone.value.replace(/\D/g, "").slice(0, 11);
  if (v.length > 10) {
    v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  } else if (v.length > 5) {
    v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  } else if (v.length > 2) {
    v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  } else if (v.length > 0) {
    v = v.replace(/(\d{0,2})/, "($1");
  }
  campoTelefone.value = v.trim().replace(/-$/, "").replace(/\($/, "");
});

// ── Máscara de CEP ────────────────────────────────────────────────────────
campoCep.addEventListener("input", () => {
  let v = campoCep.value.replace(/\D/g, "").slice(0, 8);
  if (v.length > 5) v = v.replace(/(\d{5})(\d{0,3})/, "$1-$2");
  campoCep.value = v;
});

// Busca automática de endereço via ViaCEP (gratuito, sem necessidade de chave)
campoCep.addEventListener("blur", async () => {
  const cepLimpo = campoCep.value.replace(/\D/g, "");
  if (cepLimpo.length !== 8) return;

  campoEndereco.value = "Buscando...";
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const dados = await resposta.json();

    if (dados.erro) {
      campoEndereco.value = "";
      mostrarMsg(msgEndereco, "CEP não encontrado. Verifique e tente novamente.");
      return;
    }

    campoEndereco.value = `${dados.logradouro || ""}, ${dados.bairro || ""}`.replace(/^, /, "");
    campoCidadeUf.value = `${dados.localidade} - ${dados.uf}`;
    mostrarMsg(msgEndereco, "");
  } catch {
    campoEndereco.value = "";
    mostrarMsg(msgEndereco, "Não foi possível buscar o CEP agora. Tente novamente.");
  }
});

// ── Carregar dados do usuário ────────────────────────────────────────────
exigirLogin(async ({ usuario, perfil }) => {
  usuarioAtual = usuario;

  const nome = perfil?.nome || usuario.displayName || "";
  const fotoURL = perfil?.fotoURL || usuario.photoURL || "";

  nomeTitulo.textContent = nome || "Minha Conta";
  emailTitulo.textContent = usuario.email;
  atualizarAvatar(nome, fotoURL);

  campoNome.value = nome;
  campoEmail.value = usuario.email;
  campoTelefone.value = perfil?.telefone || "";
  campoFoto.value = fotoURL;

  // Carrega endereço salvo, se existir
  try {
    const refEndereco = doc(db, "usuarios", usuario.uid, "dados", "endereco");
    const snap = await getDoc(refEndereco);
    if (snap.exists()) {
      const e = snap.data();
      campoCep.value = e.cep || "";
      campoEndereco.value = e.endereco || "";
      campoCidadeUf.value = e.cidadeUf || "";
      campoComplemento.value = e.complemento || "";
    }
  } catch (erro) {
    console.error("Erro ao carregar endereço:", erro);
  }
});

// ── Salvar dados pessoais ────────────────────────────────────────────────
formDados.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMsg(msgDados, "");

  const nome = campoNome.value.trim();
  const telefone = campoTelefone.value.trim();
  const fotoURL = campoFoto.value.trim();

  if (!nome) {
    mostrarMsg(msgDados, "O nome não pode ficar em branco.");
    return;
  }

  btnSalvarDados.disabled = true;
  btnSalvarDados.textContent = "Salvando...";

  try {
    await atualizarPerfil(usuarioAtual, { nome, telefone, fotoURL });
    nomeTitulo.textContent = nome;
    atualizarAvatar(nome, fotoURL);
    mostrarMsg(msgDados, "Dados atualizados com sucesso!", "sucesso");
  } catch (erro) {
    mostrarMsg(msgDados, traduzErroAuth(erro.code));
  } finally {
    btnSalvarDados.disabled = false;
    btnSalvarDados.textContent = "Salvar alterações";
  }
});

// ── Alterar senha ─────────────────────────────────────────────────────────
formSenha.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMsg(msgSenha, "");

  const senhaAtual = campoSenhaAtual.value;
  const novaSenha = campoSenhaNova.value;
  const confirma = campoSenhaConfirma.value;

  if (novaSenha.length < 6) {
    mostrarMsg(msgSenha, "A nova senha precisa ter pelo menos 6 caracteres.");
    return;
  }
  if (novaSenha !== confirma) {
    mostrarMsg(msgSenha, "As senhas não coincidem.");
    return;
  }

  btnSalvarSenha.disabled = true;
  btnSalvarSenha.textContent = "Alterando...";

  try {
    await alterarSenha(usuarioAtual, senhaAtual, novaSenha);
    mostrarMsg(msgSenha, "Senha alterada com sucesso!", "sucesso");
    formSenha.reset();
  } catch (erro) {
    mostrarMsg(msgSenha, traduzErroAuth(erro.code));
  } finally {
    btnSalvarSenha.disabled = false;
    btnSalvarSenha.textContent = "Alterar senha";
  }
});

// ── Logout ────────────────────────────────────────────────────────────────
btnLogout.addEventListener("click", async () => {
  const confirmar = confirm("Deseja sair da sua conta?");
  if (!confirmar) return;
  await logoutUsuario();
  window.location.href = "./index.html";
});

// ── Salvar endereço ───────────────────────────────────────────────────────
formEndereco.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMsg(msgEndereco, "");

  const cep = campoCep.value.trim();
  const endereco = campoEndereco.value.trim();
  const cidadeUf = campoCidadeUf.value.trim();
  const complemento = campoComplemento.value.trim();

  if (!cep || !endereco) {
    mostrarMsg(msgEndereco, "Informe o CEP e aguarde o endereço ser preenchido.");
    return;
  }

  btnSalvarEndereco.disabled = true;
  btnSalvarEndereco.textContent = "Salvando...";

  try {
    const refEndereco = doc(db, "usuarios", usuarioAtual.uid, "dados", "endereco");
    await setDoc(refEndereco, {
      cep,
      endereco,
      cidadeUf,
      complemento,
      atualizadoEm: serverTimestamp()
    });
    mostrarMsg(msgEndereco, "Endereço salvo com sucesso!", "sucesso");
  } catch (erro) {
    console.error(erro);
    mostrarMsg(msgEndereco, "Não foi possível salvar o endereço. Tente novamente.");
  } finally {
    btnSalvarEndereco.disabled = false;
    btnSalvarEndereco.textContent = "Salvar endereço";
  }
});
