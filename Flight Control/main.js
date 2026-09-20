// Interface (onglets, langue, plein ecran). Volontairement independante de
// three.js : si le CDN ou WebGL echoue, le panneau reste utilisable et un
// message explique le probleme au lieu d'afficher une page vide.
import { applyTranslations, getLanguage, onLanguageChange, setLanguage } from "./i18n.js";

const panel = document.querySelector("#panel");
const railTabs = document.querySelectorAll(".rail-tab");
const panelPanes = document.querySelectorAll(".panel-pane");
const languageButton = document.querySelector("#languageButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const compactLayout = window.matchMedia("(max-width: 900px)");

function setActiveTab(tabName) {
  railTabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
  panelPanes.forEach((pane) => pane.classList.toggle("active", pane.dataset.pane === tabName));
}

railTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    panel.classList.remove("collapsed");
    setActiveTab(btn.dataset.tab);
  });
});

document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.gotoTab));
});

document.querySelector("#panelToggle").addEventListener("click", () => {
  panel.classList.toggle("collapsed");
});

// Langue : le bouton propose l'autre langue que celle affichee.
function renderLanguageButton() {
  languageButton.textContent = getLanguage() === "fr" ? "EN" : "FR";
}

languageButton.addEventListener("click", () => {
  setLanguage(getLanguage() === "fr" ? "en" : "fr");
});
onLanguageChange(renderLanguageButton);

// Plein ecran : indisponible sur iPhone, le bouton reste alors masque.
const fullscreenRoot = document.documentElement;
const requestFullscreen = fullscreenRoot.requestFullscreen?.bind(fullscreenRoot)
  ?? fullscreenRoot.webkitRequestFullscreen?.bind(fullscreenRoot);
const exitFullscreen = (document.exitFullscreen ?? document.webkitExitFullscreen)?.bind(document);

function isFullscreen() {
  return Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
}

if (requestFullscreen && exitFullscreen) {
  fullscreenButton.hidden = false;
  fullscreenButton.addEventListener("click", () => {
    (isFullscreen() ? exitFullscreen() : requestFullscreen())?.catch?.(() => {});
  });
  const onFullscreenChange = () => {
    if (isFullscreen()) {
      panel.classList.add("collapsed");
    }
  };
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
}

// Sur petit ecran, replier le panneau des que le pilotage demarre pour laisser
// toute la place a la vue 3D. app.js emet cet evenement.
document.addEventListener("flight:started", () => {
  if (compactLayout.matches) {
    panel.classList.add("collapsed");
  }
});

// Navigateur sans Web Serial (Firefox, Safari, tous les mobiles) : on l'annonce
// au lieu de laisser un bouton qui echoue. Sur ecran tactile, le pilotage au
// telephone devient l'option principale.
if (!navigator.serial) {
  const connectButton = document.querySelector("#connectButton");
  const note = document.querySelector("#connectText");
  connectButton.disabled = true;
  note.dataset.i18n = "step2.unsupported";

  if (window.matchMedia("(pointer: coarse)").matches) {
    const phoneCard = document.querySelector("#phoneCard");
    phoneCard.querySelector("h2").dataset.i18n = "phone.titlePrimary";
    document.querySelector("#firmwareCard").before(phoneCard);
  }
}

setActiveTab("connect");
renderLanguageButton();
applyTranslations();

import("./app.js").catch((error) => {
  console.error("Chargement de la vue 3D impossible :", error);
  document.querySelector("#loadError").hidden = false;
});
