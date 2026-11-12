# HenergyqueAI pour Windows et macOS

L'application de bureau de [HenergyqueAI](https://henergyqueai.fr) : la connexion et l'espace de chat, installés sur votre ordinateur.

- **Question rapide** : `Alt+Espace` (`Option+Espace` sur Mac) ouvre une petite fenêtre pour poser une question depuis n'importe où.
- **Dictée locale** : le micro est transcrit sur votre ordinateur, sans connexion. La voix ne le quitte jamais.
- **Notifications** quand une réponse arrive pendant que vous faites autre chose.
- **Zone de notification** et lancement au démarrage, au choix.

## Télécharger

[henergyqueai.fr/telecharger](https://henergyqueai.fr/telecharger)

L'application n'est pas encore signée.
- **Windows** : au premier lancement, cliquez sur « Informations complémentaires », puis « Exécuter quand même ».
- **macOS** : faites un clic droit sur l'application, puis « Ouvrir ».

## Développer

```sh
npm ci
npm run fetch-model   # modèle de transcription (environ 76 Mo)
npm start
npm test
```

`ui/` contient l'interface compilée, publiée avec chaque version. L'application parle à l'API de `https://henergyqueai.fr` ; la variable `HENERGYQUE_API_URL` permet de viser un autre serveur.

Pour publier une version, poussez une étiquette `vX.Y.Z` : le workflow fabrique l'installateur Windows et les deux images macOS, puis les joint à la Release.

## Licence

MIT
