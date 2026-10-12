const express = require('express'); // Importation du module express
const { DatabaseSync } = require('node:sqlite'); // SQLite intégré à Node (aucune installation)
const bcrypt = require('bcryptjs'); // Hachage des mots de passe (JavaScript pur)
const path = require('path');
const jwt = require('jsonwebtoken'); // Gestion des chemins de fichiers

// Création de l'application express
const app = express();
const SECRET_KEY = "cle-secrete-projet-quiz";

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// Création de la base de données SQLite (à côté de server.js)
const db = new DatabaseSync(path.join(__dirname, 'quiz.db'));

// Création de la table utilisateurs si elle n'existe pas déjà
db.exec(`CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    mot_de_passe TEXT NOT NULL)`);

// INSERT OR IGNORE + UNIQUE : l'enseignant n'est créé qu'une seule fois
const hash = bcrypt.hashSync('Farid', 10);
db.prepare(`INSERT OR IGNORE INTO utilisateurs (nom, mot_de_passe) VALUES (?, ?)`)
  .run('Farid', hash);

// Route pour la connexion des utilisateurs
app.post('/api/connexion', async (req, res) => {
    const { usager, password } = req.body;

    const row = db.prepare(`SELECT * FROM utilisateurs WHERE nom = ?`).get(usager);

    if (!row || !(await bcrypt.compare(password, row.mot_de_passe))) {
        return res.status(401).json({ ok: false, message: "L'usager ou le mot de passe est incorrect" });
    }
    const token = jwt.sign(
    {
        id: row.id,
        nom: row.nom
    },
    SECRET_KEY,
    {
        expiresIn: "1h"
    }
);

res.json({
    ok: true,
    token: token
});

});

app.get('/api/verifier-token', (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            ok: false
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const utilisateur = jwt.verify(token, SECRET_KEY);

        res.json({
            ok: true,
            utilisateur: utilisateur
        });
    }
    catch {
        res.status(401).json({
            ok: false
        });
    }
});

app.listen(3000, () => console.log('http://localhost:3000/Accueil.html'));