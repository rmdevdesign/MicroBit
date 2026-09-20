// Traductions FR / EN. Les elements HTML declarent leur cle avec :
//   data-i18n="cle"                  -> textContent
//   data-i18n-html="cle"             -> innerHTML (dictionnaire de confiance uniquement)
//   data-i18n-attr="title:cle,aria-label:cle2"  -> attributs

const dictionary = {
  fr: {
    "page.description": "Simulateur de vol 3D piloté avec un micro:bit ou votre téléphone. Inclinez la manette, l'avion suit.",
    "toggle.title": "Replier / déplier le panneau",
    "toggle.aria": "Replier ou déplier le panneau",
    "tab.connect": "Connexion",
    "tab.controls": "Manette",
    "tab.telemetry": "Télémétrie",
    "tab.debug": "Debug",
    "rail.fullscreen": "Plein écran",
    "rail.language": "Switch to English",

    "brand.aria": "RM Dev Design — rmdev.design",
    "home.badge": "Simulateur de vol",
    "home.title": "Volez avec votre <span class=\"gradient-text\">micro:bit</span>",
    "home.intro": "Inclinez la manette, l'avion 3D suit.",

    "step1.title": "Préparer le micro:bit",
    "step1.text": "Téléchargez le programme et déposez-le sur la clé <code>MICROBIT</code> qui apparaît quand vous le branchez.",
    "step1.button": "Télécharger",
    "step2.title": "Décoller",
    "step2.text": "Cliquez sur Connecter, choisissez votre micro:bit, et c'est parti. Fonctionne sur Chrome et Edge.",
    "step2.unsupported": "La connexion USB n'est pas disponible sur ce navigateur : utilisez Chrome ou Edge sur ordinateur.",
    "step2.connect": "Connecter",
    "step2.disconnect": "Déconnecter",
    "step3.title": "Personnaliser",
    "step3.text": "Inversez les axes, ajustez la sensibilité, tournez l'avion… Tout se règle depuis l'onglet Manette du menu.",
    "step3.button": "Régler la manette",
    "phone.title": "Pas de micro:bit ?",
    "phone.titlePrimary": "Pilotez avec votre téléphone",
    "phone.text": "Utilisez votre téléphone : tenez-le droit comme un volant (portrait ou paysage), et inclinez-le.",
    "phone.on": "Utiliser mon téléphone",
    "phone.off": "Arrêter le téléphone",
    "credit.text": "Conçu et développé par",

    "controls.title": "Réglages manette",
    "controls.aria": "Réglages des axes",
    "controls.invertPitch": "Inverser tangage",
    "controls.invertRoll": "Inverser roulis",
    "controls.enableYaw": "Activer cap boussole",
    "controls.rollSensitivity": "Sensibilité roulis",
    "controls.pitchSensitivity": "Sensibilité tangage",
    "controls.orientation": "Orientation avion",
    "controls.center": "Recentrer manette",
    "controls.resetYaw": "Recentrer cap",

    "telemetry.title": "Télémétrie",
    "telemetry.state": "État",
    "telemetry.neutral": "Neutre",
    "telemetry.format": "Format attendu via le port série USB :",

    "debug.intro": "Pilote l'avion et la mire à la souris, sans micro:bit branché.",
    "debug.aria": "Pilotage manuel de debug",
    "debug.enable": "Activer le mode debug (ignore le micro:bit)",
    "debug.pitch": "Tangage manuel :",
    "debug.roll": "Roulis manuel :",
    "debug.yaw": "Cap manuel :",
    "debug.reset": "Réinitialiser",

    "hud.roll": "Roulis :",
    "hud.pitch": "Tangage :",
    "hud.yaw": "Cap :",
    "viewer.attitude": "Horizon artificiel",
    "viewer.stick": "Visualisation de la manette",
    "viewer.badge": "Créé par RM Dev Design — rmdev.design",

    "error.title": "La vue 3D n'a pas pu se charger",
    "error.text": "Vérifiez votre connexion Internet et que WebGL est activé, puis rechargez la page.",
    "error.reload": "Recharger",

    "st.waiting": "En attente",
    "st.streamActive": "Flux de données actif",
    "st.frameIgnored": "Trame ignorée : {line}",
    "st.disconnected": "Déconnecté",
    "st.selecting": "Sélection du port USB...",
    "st.connected": "Connecté en USB. En attente de trames...",
    "st.noSerial": "Web Serial non disponible dans ce navigateur",
    "st.connectFailed": "Connexion impossible",
    "st.phoneActive": "Capteurs de l'appareil actifs",
    "st.phoneOff": "Capteurs de l'appareil désactivés",
    "st.noOrientation": "Capteurs d'orientation non disponibles sur cet appareil",
    "st.insecure": "Capteurs bloqués : ouvrir la page en HTTPS",
    "st.denied": "Accès aux capteurs refusé (Réglages > Safari > Mouvement et orientation)",
    "st.sensorFailed": "Accès aux capteurs impossible",
    "st.phoneWaiting": "Capteurs de l'appareil : en attente de données...",
    "st.phoneNone": "Aucun capteur d'orientation détecté sur cet appareil",
  },

  en: {
    "page.description": "3D flight simulator controlled with a micro:bit or your phone. Tilt the controller, the plane follows.",
    "toggle.title": "Collapse / expand the panel",
    "toggle.aria": "Collapse or expand the panel",
    "tab.connect": "Connect",
    "tab.controls": "Controls",
    "tab.telemetry": "Telemetry",
    "tab.debug": "Debug",
    "rail.fullscreen": "Fullscreen",
    "rail.language": "Passer en français",

    "brand.aria": "RM Dev Design — rmdev.design",
    "home.badge": "Flight simulator",
    "home.title": "Fly with your <span class=\"gradient-text\">micro:bit</span>",
    "home.intro": "Tilt the controller, the 3D plane follows.",

    "step1.title": "Set up the micro:bit",
    "step1.text": "Download the program and drop it onto the <code>MICROBIT</code> drive that appears when you plug it in.",
    "step1.button": "Download",
    "step2.title": "Take off",
    "step2.text": "Click Connect, pick your micro:bit, and you're off. Works on Chrome and Edge.",
    "step2.unsupported": "USB connection isn't available in this browser: use Chrome or Edge on a computer.",
    "step2.connect": "Connect",
    "step2.disconnect": "Disconnect",
    "step3.title": "Customize",
    "step3.text": "Invert the axes, adjust the sensitivity, rotate the plane… It's all in the Controls tab of the menu.",
    "step3.button": "Open controls",
    "phone.title": "No micro:bit?",
    "phone.titlePrimary": "Fly with your phone",
    "phone.text": "Use your phone: hold it upright like a steering wheel (portrait or landscape), and tilt it.",
    "phone.on": "Use my phone",
    "phone.off": "Stop the phone",
    "credit.text": "Designed and built by",

    "controls.title": "Controller settings",
    "controls.aria": "Axis settings",
    "controls.invertPitch": "Invert pitch",
    "controls.invertRoll": "Invert roll",
    "controls.enableYaw": "Enable compass heading",
    "controls.rollSensitivity": "Roll sensitivity",
    "controls.pitchSensitivity": "Pitch sensitivity",
    "controls.orientation": "Aircraft heading",
    "controls.center": "Recenter controller",
    "controls.resetYaw": "Recenter heading",

    "telemetry.title": "Telemetry",
    "telemetry.state": "Status",
    "telemetry.neutral": "Neutral",
    "telemetry.format": "Expected format over the USB serial port:",

    "debug.intro": "Control the plane and the gauges with your mouse, no micro:bit needed.",
    "debug.aria": "Manual debug controls",
    "debug.enable": "Enable debug mode (ignores the micro:bit)",
    "debug.pitch": "Manual pitch:",
    "debug.roll": "Manual roll:",
    "debug.yaw": "Manual heading:",
    "debug.reset": "Reset",

    "hud.roll": "Roll:",
    "hud.pitch": "Pitch:",
    "hud.yaw": "Heading:",
    "viewer.attitude": "Artificial horizon",
    "viewer.stick": "Controller view",
    "viewer.badge": "Made by RM Dev Design — rmdev.design",

    "error.title": "The 3D view couldn't load",
    "error.text": "Check your Internet connection and that WebGL is enabled, then reload the page.",
    "error.reload": "Reload",

    "st.waiting": "Waiting",
    "st.streamActive": "Data stream active",
    "st.frameIgnored": "Frame ignored: {line}",
    "st.disconnected": "Disconnected",
    "st.selecting": "Selecting the USB port...",
    "st.connected": "Connected over USB. Waiting for frames...",
    "st.noSerial": "Web Serial isn't available in this browser",
    "st.connectFailed": "Connection failed",
    "st.phoneActive": "Device sensors active",
    "st.phoneOff": "Device sensors off",
    "st.noOrientation": "Orientation sensors aren't available on this device",
    "st.insecure": "Sensors blocked: open the page over HTTPS",
    "st.denied": "Sensor access denied (Settings > Safari > Motion & Orientation)",
    "st.sensorFailed": "Couldn't access the sensors",
    "st.phoneWaiting": "Device sensors: waiting for data...",
    "st.phoneNone": "No orientation sensor detected on this device",
  },
};

const STORAGE_KEY = "flightcontrol-lang";
const listeners = [];

function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "fr" || saved === "en") {
      return saved;
    }
  } catch {
    // Stockage indisponible : on se rabat sur la langue du navigateur.
  }
  return (navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
}

let language = detectLanguage();

export function getLanguage() {
  return language;
}

export function t(key, vars = {}) {
  const text = dictionary[language][key] ?? dictionary.fr[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

export function applyTranslations(root = document) {
  document.documentElement.lang = language;
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("page.description"));

  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.dataset.i18nAttr.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((part) => part.trim());
      el.setAttribute(attr, t(key));
    });
  });
}

export function setLanguage(next) {
  if (next !== "fr" && next !== "en") {
    return;
  }
  language = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Non bloquant.
  }
  applyTranslations();
  listeners.forEach((callback) => callback(next));
}

export function onLanguageChange(callback) {
  listeners.push(callback);
}
