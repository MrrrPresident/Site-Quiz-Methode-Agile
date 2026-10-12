# Site Quiz – Méthode Agile

Site web de quiz avec une connexion pour les enseignants. Le serveur est écrit avec Node.js et Express, et les utilisateurs sont stockés dans une base de données SQLite.

## Fonctionnalités

- Page de connexion pour un enseignant (`Accueil.html`)
- Vérification de l'usager et du mot de passe côté serveur
- Mots de passe hachés avec `bcryptjs`
- Base de données SQLite créée automatiquement au premier lancement

## Technologies

- Node.js (v22.5 ou plus, SQLite intégré via `node:sqlite`)
- Express
- bcryptjs
- HTML, CSS et JavaScript

## Structure du projet

```
Site-Quiz-Methode-Agile/
├── public/
│   └── Accueil.html     # Page de connexion
├── server.js            # Serveur Express et base de données
├── package.json
├── package-lock.json
└── README.md
```

## Installation

1. Cloner le dépôt :
```bash
   git clone <url-du-depot>
   cd Projet-Methode-Agile/Site-Quiz-Methode-Agile
```
2. Installer les dépendances :
```bash
   npm install
```

## Lancement

```bash
node server.js
```

Ouvrir ensuite http://localhost:3000/Accueil.html dans le navigateur.

Au premier lancement, le fichier `quiz.db` est créé automatiquement avec un compte enseignant par défaut.

## Compte de test

| Usager | Mot de passe |
|--------|--------------|
| Farid  | Farid        |

> Ce compte sert uniquement au développement. Il faudra le changer avant toute mise en ligne.

## Notes

- Le dossier `node_modules/` et le fichier `quiz.db` ne sont pas versionnés (voir `.gitignore`).
- Le port par défaut est `3000`; il se modifie à la dernière ligne de `server.js`.