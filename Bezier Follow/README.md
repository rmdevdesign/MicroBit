# Bezier Follow

Application web locale pour enregistrer les donnees d'un micro:bit en USB serie, puis visualiser la forme relative du parcours sous forme de spline 3D.

Le Bluetooth a ete retire du projet: le micro:bit reste la source des inputs, mais la connexion passe par le cable USB pour fonctionner de maniere fiable sur macOS et Windows.

## Lancer

Sur Windows, double-cliquer sur `launch.bat`.

Sur macOS, lancer dans Terminal:

```bash
chmod +x launch-mac.command
./launch-mac.command
```

La page s'ouvre automatiquement sur `http://localhost:8081` ou sur le port libre suivant. Utiliser Chrome ou Edge pour Web Serial.

## Programmer le micro:bit

1. Ouvrir `https://makecode.microbit.org/`.
2. Creer un projet.
3. Passer en JavaScript.
4. Coller le contenu de `microbit-makecode.ts`.
5. Telecharger le `.hex`.
6. Glisser le `.hex` sur le lecteur `MICROBIT`.
7. Laisser le micro:bit branche en USB pour envoyer les donnees a l'app.

Le programme envoie une ligne JSON toutes les 50 ms par USB serie:

```json
{"x":12,"y":-8,"z":1010,"pitch":4,"roll":-2,"heading":180}
```

## Utilisation

1. Lancer l'app depuis `launch.bat` sur Windows ou `launch-mac.command` sur macOS.
2. Cliquer sur `Connecter USB micro:bit`.
3. Choisir le port du micro:bit dans Chrome/Edge.
4. Cliquer sur `Start recording`.
5. Bouger le micro:bit ou lancer le wagon.
6. Cliquer sur `Stop recording`.
7. Exporter en JSON ou CSV si besoin.

Le bouton `Simulation` permet de tester l'interface sans micro:bit. Le bouton `Importer` recharge un export JSON/CSV ou des donnees brutes compatibles.

## Comment la courbe est calculee

La courbe utilise `heading` et `pitch` pour avancer dans la direction du wagon. `roll` sert uniquement a orienter le marqueur du wagon.

L'acceleration sert a detecter si le wagon bouge: la courbe avance a vitesse relative constante uniquement pendant les phases de mouvement. Les exports contiennent `moving` et `motionScore` pour verifier cette detection.

Monter le micro:bit a plat sur le wagon, avec son bord USB dirige vers l'avant. Si les montees et descentes sont inversees, changer `PITCH_SIGN` de `-1` a `1` dans `app.js`. Si le wagon est monte dans une autre direction horizontale, ajuster `HEADING_OFFSET_DEGREES`.

Le compas doit etre calibre et peut etre perturbe par un rail ou un chassis metallique.

## Si l'USB ne se connecte pas

- Utiliser Chrome ou Edge, pas Firefox/Safari.
- Ouvrir la page depuis `http://localhost:8081` ou le port affiche dans le terminal, pas depuis le fichier `index.html`.
- Verifier que le micro:bit est branche avec un cable USB data, pas seulement charge.
- Fermer MakeCode Serial Monitor ou toute app qui utilise deja le port serie.
- Deconnecter/reconnecter le micro:bit, puis cliquer a nouveau sur `Connecter USB micro:bit`.

## Limite importante

La trajectoire 3D represente la forme relative du parcours, pas une position absolue ni une distance metrique precise. Les accelerations restent affichees et exportees, mais elles ne sont pas integrees pour dessiner la courbe: la double integration derive tres vite et la gravite change d'axe lorsque le wagon s'incline.

Un mouvement parfaitement regulier, sans vibration ni changement d'acceleration, ne peut pas etre distingue de l'immobilite avec le micro:bit seul. Pour ce cas, il faut ajouter un encodeur, un capteur de passage ou une autre reference externe.

Pour une trajectoire metrique fiable, il faudrait ajouter une reference externe: camera, balises, encodeur sur rail, ou correction par points connus.
