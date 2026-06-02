# Bezier Follow

Application web separee pour enregistrer un wagon de grand 8 miniature avec un micro:bit en Bluetooth, puis visualiser la trajectoire relative sous forme de spline 3D.

## Lancer

Sur Windows, double-cliquer sur `launch.bat`.

La page s'ouvre sur `http://localhost:8081`. Chrome ou Edge sont recommandes pour Web Bluetooth.

## Programmer le micro:bit

1. Ouvrir `https://makecode.microbit.org/`.
2. Creer un projet.
3. Aller dans `Extensions`, chercher `Bluetooth`, puis ajouter l'extension Bluetooth.
4. Accepter que MakeCode retire l'extension `Radio` si la fenetre le demande.
5. Aller dans la roue dentee, puis `Project Settings`.
6. Activer `No Pairing Required: Anyone can connect via Bluetooth`.
7. Passer en JavaScript.
8. Coller le contenu de `microbit-makecode.ts`.
9. Telecharger le `.hex` et le glisser sur le lecteur `MICROBIT` avec le cable USB.
10. Deconnecter/reconnecter l'alimentation du micro:bit pour redemarrer le programme.

Le programme envoie une ligne JSON toutes les 50 ms via le service Bluetooth UART:

```json
{"x":12,"y":-8,"z":1010,"pitch":4,"roll":-2,"heading":180}
```

## Utilisation Bluetooth

1. Ouvrir la page depuis `launch.bat`.
2. Le micro:bit affiche son nom de 5 lettres au demarrage. Appuyer sur `A` pour le revoir.
3. Cliquer sur `Connecter micro:bit`.
4. Choisir l'appareil qui ressemble a `BBC micro:bit [xxxxx]`, `micro:bit [xxxxx]`, ou au nom de 5 lettres affiche sur les LEDs.
5. Si rien ne ressemble a ca, cliquer sur `Scan complet`, puis chercher le nom de 5 lettres affiche par le micro:bit.
6. Cliquer sur `Start recording`.
7. Lancer le wagon.
8. Cliquer sur `Stop recording`.
9. Exporter en JSON ou CSV si besoin.

Le bouton `Simulation` permet de tester l'interface 3D sans micro:bit.

## Si le Bluetooth ne se connecte pas

- Utiliser Chrome ou Edge, pas Firefox.
- Ouvrir la page depuis `http://localhost:8081`, pas depuis le fichier `index.html`.
- Flasher le programme par USB au moins une fois apres avoir ajoute l'extension Bluetooth.
- Verifier que `No Pairing Required` est active dans MakeCode.
- Ne pas rester en mode appairage `A+B+reset` pour utiliser l'app. Ce mode peut etre visible par Chrome, mais il n'expose pas le service UART du programme.
- Apres appairage/flash, redemarrer normalement le micro:bit sans maintenir de bouton. Le programme doit afficher le nom de 5 lettres, puis envoyer l'UART.
- Fermer les applis qui peuvent deja etre connectees au micro:bit.
- Redemarrer le micro:bit apres le flash.
- Appuyer sur `A` sur le micro:bit pour afficher son nom de 5 lettres, puis chercher ce nom dans la liste.
- Si le micro:bit n'apparait toujours pas, supprimer l'ancien pairing Windows dans les parametres Bluetooth, puis reessayer.

La procedure `A+B+reset` de la documentation micro:bit sert surtout a appairer. Pour cette app web, le navigateur doit se connecter au micro:bit quand le programme MakeCode tourne normalement et expose `bluetooth.startUartService()`.

## Limite importante

Le micro:bit donne surtout une acceleration et une orientation. La trajectoire 3D affichee est une reconstruction relative par integration de l'acceleration, pas une position absolue precise. Pour une trajectoire metrique fiable, il faudrait ajouter une reference externe: camera, balises, encodeur sur rail, ou correction par points connus.
