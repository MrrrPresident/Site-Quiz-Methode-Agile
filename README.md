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

Au premier lancement, le fichier `quiz.db` est créé automatiquement avec un compte enseignant et cinq comptes étudiants. Les comptes manquants sont aussi ajoutés à une base existante au démarrage du serveur.

## Comptes de test

| Usager | Mot de passe | Rôle |
|--------|--------------|------|
| Farid  | Farid        | enseignant |
| eleve1 | eleve1       | étudiant |
| eleve2 | eleve2       | étudiant |
| eleve3 | eleve3       | étudiant |
| eleve4 | eleve4       | étudiant |
| eleve5 | eleve5       | étudiant |

> Ces comptes servent uniquement au développement. Il faudra les changer avant toute mise en ligne. Les comptes étudiants sont créés par le serveur : l'enseignant ne peut pas en créer.

## Pages

| Page | Pour qui | Rôle |
|------|----------|------|
| `Accueil.html` | tous | Connexion élève ou enseignant |
| `dashboard.html` | enseignant | Quiz (publier / dépublier / supprimer) |
| `creation-quiz.html` | enseignant | Création d'un quiz |
| `confirmation.html?id=N` | enseignant | Confirmation après publication, avec le lien pour les élèves |
| `quiz.html` | élève connecté | Liste des quiz publiés; `quiz.html?id=N` pour répondre (une seule tentative) |

## Voir le contenu de la base

`quiz.db` n'est pas chiffré : c'est un fichier SQLite binaire, donc illisible dans un éditeur de texte. Pour l'afficher en clair :

```bash
npm run voir-db
```

Les mots de passe restent hachés avec bcrypt : c'est voulu, on ne peut pas les relire.

## Notes

- Le dossier `node_modules/` et le fichier `quiz.db` ne sont pas versionnés (voir `.gitignore`).
- Le port par défaut est `3000`; il se modifie à la dernière ligne de `server.js`.