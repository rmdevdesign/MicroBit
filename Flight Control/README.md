# Micro:bit flight controller

Demo web qui connecte un `BBC micro:bit` en USB avec `Web Serial` et utilise son accelerometre dans une manette type avion pour piloter un avion 3D.

## Fichiers

- `launch.bat` : lance le serveur local et ouvre la page sur Windows
- `launch-mac.command` : lance le serveur local et ouvre la page sur macOS
- `server.js` : petit serveur HTTP local
- `index.html` : interface web
- `styles.css` : styles
- `app.js` : scene 3D, port serie USB, orientation et trainees d'air
- `microbit-makecode.ts` : code a coller dans MakeCode

## Lancer

Sur Windows, double-cliquer sur :

```text
launch.bat
```

Sur macOS, double-cliquer sur :

```text
launch-mac.command
```

Si macOS refuse d'ouvrir le fichier, ouvrir le Terminal dans ce dossier puis lancer une fois :

```bash
chmod +x launch-mac.command
./launch-mac.command
```

La page s'ouvre automatiquement sur `http://localhost:8080` ou sur le port libre suivant.

Ne pas ouvrir `index.html` directement : `Web Serial` fonctionne de maniere fiable depuis `localhost`.

## Programmer le micro:bit

Option rapide si le fichier est present dans le dossier :

1. Glisser `microbit-FlightControl.hex` sur le lecteur `MICROBIT`
2. Attendre que le micro:bit redemarre

Le fichier `.hex` disparait du lecteur `MICROBIT` apres la copie : c'est normal, le programme a ete installe.

Option MakeCode :

1. Ouvrir `https://makecode.microbit.org/`
2. Creer un projet
3. Passer en JavaScript
4. Coller le contenu de `microbit-makecode.ts`
5. Telecharger le fichier `.hex`
6. Glisser le `.hex` sur le lecteur `MICROBIT`

Au premier lancement avec la boussole, le micro:bit peut afficher `tilt to fill screen`. Incliner le micro:bit dans tous les sens jusqu'a remplir les LEDs, puis le programme continue.

## Connexion

1. Garder le micro:bit branche en USB
2. Ouvrir la page avec Chrome ou Edge
3. Cliquer sur `Connecter le micro:bit en USB`
4. Choisir le port serie du micro:bit (`mbed Serial Port`, `CMSIS-DAP`, `micro:bit`, ou nom similaire)
5. Placer la manette au neutre, puis cliquer sur `Recentrer manette`
6. Tourner la manette pour le roulis, pousser ou tirer pour le tangage

Si aucun port n'apparait, fermer MakeCode ou tout moniteur serie, debrancher/rebrancher le micro:bit, puis recharger la page.

## Reglages

La configuration par defaut actuelle est :

- `Inverser pitch` : desactive
- `Inverser roll` : desactive
- `Activer cap boussole` : desactive
- `Sensibilite roulis` : 1
- `Sensibilite tangage` : 1
- `Orientation avion` : 0 degre

Le bouton `Recentrer manette` memorise la position actuelle comme position neutre. A utiliser quand la manette est droite et au milieu.

Le bouton `Recentrer cap` definit la direction actuelle du micro:bit comme cap de reference si le cap boussole est active.

Le slider `Orientation avion` tourne le modele sur l'axe de cap, sans changer les axes de tangage et de roulis.

## Visualisation

- Le navigateur calcule le roulis et le tangage depuis `x`, `y` et `z`.
- Le roulis correspond a la rotation de la manette gauche/droite.
- Le tangage correspond a l'inclinaison quand on pousse ou tire la manette.
- Le yaw utilise la boussole du micro:bit et tourne le groupe parent de l'avion pour ne pas casser les axes pitch/roll.
- Les trainees d'air le long des ailes changent de longueur et d'intensite selon l'acceleration mesuree.
- Un apercu de la manette en haut a droite bouge avec les memes valeurs lissees que l'avion.

## Montage de la manette

Le mapping par defaut suppose que le micro:bit est fixe au centre de la manette, face visible, cable USB vers le bas. Si le sens est inverse pendant les tests, utiliser les cases `Inverser roulis` ou `Inverser tangage`, puis recentrer la manette.
