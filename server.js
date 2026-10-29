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

// SQLite ignore les clés étrangères par défaut : il faut les activer à chaque connexion
db.exec(`PRAGMA foreign_keys = ON`);

// Table des quiz : un quiz appartient à un enseignant (utilisateurs)
db.exec(`CREATE TABLE IF NOT EXISTS quiz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    createur_id INTEGER NOT NULL,
    publie INTEGER NOT NULL DEFAULT 0 CHECK (publie IN (0, 1)),
    date_creation TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (createur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE)`);

    const colonnesQuiz = db.prepare("PRAGMA table_info(quiz)").all();

if (!colonnesQuiz.some(colonne => colonne.name === "description")) {
    db.exec("ALTER TABLE quiz ADD COLUMN description TEXT NOT NULL DEFAULT ''");
}

// Table des questions : chaque question appartient à un quiz
db.exec(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    enonce TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('choix_multiples', 'vrai_faux')),
    ordre INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (quiz_id) REFERENCES quiz(id) ON DELETE CASCADE)`);

// Table des réponses : les options (A, B, C, D...) d'une question
db.exec(`CREATE TABLE IF NOT EXISTS reponses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    texte TEXT NOT NULL,
    est_correcte INTEGER NOT NULL DEFAULT 0 CHECK (est_correcte IN (0, 1)),
    ordre INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE)`);

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

function verifierEnseignant(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            ok: false,
            message: "Connexion nécessaire"
        });
    }

    try {
        req.utilisateur = jwt.verify(token, SECRET_KEY);
        next();
    } catch {
        return res.status(401).json({
            ok: false,
            message: "Session invalide ou expirée"
        });
    }
}

app.post('/api/quiz', verifierEnseignant, (req, res) => {
    const { titre } = req.body;

    if (typeof titre !== "string" || !titre.trim()) {
        return res.status(400).json({
            ok: false,
            message: "Le titre du quiz est obligatoire"
        });
    }

    const resultat = db.prepare(`
        INSERT INTO quiz (titre, createur_id)
        VALUES (?, ?)
    `).run(titre.trim(), req.utilisateur.id);

    res.status(201).json({
        ok: true,
        quiz_id: Number(resultat.lastInsertRowid),
        message: "Quiz enregistré"
    });
});

app.post('/api/quiz/:quizId/questions', verifierEnseignant, (req, res) => {

    const quizId = Number(req.params.quizId);

    if (!Number.isSafeInteger(quizId) || quizId <= 0) {
        return res.status(400).json({
            ok: false,
            message: "Identifiant de quiz invalide"
        });
    }

    const quiz = db.prepare(`
        SELECT id FROM quiz
        WHERE id = ? AND createur_id = ?
    `).get(quizId, req.utilisateur.id);

    if (!quiz) {
        return res.status(404).json({
            ok: false,
            message: "Quiz introuvable"
        });
    }

   const { enonce, type } = req.body;

if (typeof enonce !== "string" || !enonce.trim()) {
    return res.status(400).json({
        ok: false,
        message: "L'énoncé est obligatoire"
    });
}

if (type !== "choix_multiples" && type !== "vrai_faux") {
    return res.status(400).json({
        ok: false,
        message: "Type de question invalide"
    });
}

const resultat = db.prepare(`
    INSERT INTO questions (quiz_id, enonce, type)
    VALUES (?, ?, ?)
`).run(quizId, enonce.trim(), type);

res.status(201).json({
    ok: true,
    question_id: Number(resultat.lastInsertRowid),
    message: "Question enregistrée"
});

});

app.post('/api/questions/:questionId/reponses', verifierEnseignant, (req, res) => {

    const questionId = Number(req.params.questionId);

    if (!Number.isSafeInteger(questionId) || questionId <= 0) {
        return res.status(400).json({
            ok: false,
            message: "Identifiant de question invalide"
        });
    }

    const question = db.prepare(`
        SELECT questions.id
        FROM questions
        JOIN quiz ON questions.quiz_id = quiz.id
        WHERE questions.id = ?
        AND quiz.createur_id = ?
    `).get(questionId, req.utilisateur.id);

    if (!question) {
        return res.status(404).json({
            ok: false,
            message: "Question introuvable"
        });
    }

   const { reponses } = req.body;

if (!Array.isArray(reponses) || reponses.length < 2 || reponses.length > 5) {
    return res.status(400).json({
        ok: false,
        message: "Il faut entre 2 et 5 réponses"
    });
}

if (reponses.some(reponse =>
    !reponse ||
    typeof reponse.texte !== "string" ||
    !reponse.texte.trim() ||
    typeof reponse.est_correcte !== "boolean"
)) {
    return res.status(400).json({
        ok: false,
        message: "Réponses invalides"
    });
}

const nombreCorrectes = reponses.filter(reponse => reponse.est_correcte).length;

if (nombreCorrectes !== 1) {
    return res.status(400).json({
        ok: false,
        message: "Il faut exactement une bonne réponse"
    });
}

const insertion = db.prepare(`
    INSERT INTO reponses (question_id, texte, est_correcte, ordre)
    VALUES (?, ?, ?, ?)
`);

try {
    db.exec("BEGIN TRANSACTION");

    const dejaEnregistrees = db.prepare(`
        SELECT COUNT(*) AS total FROM reponses WHERE question_id = ?
    `).get(questionId);

    if (dejaEnregistrees.total > 0) {
        db.exec("ROLLBACK");
        return res.status(409).json({
            ok: false,
            message: "Cette question possède déjà des réponses"
        });
    }

    reponses.forEach((reponse, index) => {
        insertion.run(
            questionId,
            reponse.texte.trim(),
            reponse.est_correcte ? 1 : 0,
            index
        );
    });

    db.exec("COMMIT");

    res.status(201).json({
        ok: true,
        message: "Réponses enregistrées"
    });

} catch (erreur) {
    if (db.isTransaction) {
        db.exec("ROLLBACK");
    }

    res.status(500).json({
        ok: false,
        message: "Erreur pendant l'enregistrement"
    });
}

});

app.post('/api/quiz/complet', verifierEnseignant, (req, res) => {

    const { titre, description, questions } = req.body;
    if (description !== undefined && typeof description !== "string") {
    return res.status(400).json({
        ok: false,
        message: "Description invalide"
    });
}
    
    if (typeof titre !== "string" || !titre.trim()) {
    return res.status(400).json({
        ok: false,
        message: "Le titre du quiz est obligatoire"
    });
}

if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({
        ok: false,
        message: "Le quiz doit contenir au moins une question"
    });
}

for (const question of questions) {

    if (typeof question.enonce !== "string" || !question.enonce.trim()) {
        return res.status(400).json({
            ok: false,
            message: "Une question possède un énoncé invalide"
        });
    }

    if (question.type !== "choix_multiples" && question.type !== "vrai_faux") {
        return res.status(400).json({
            ok: false,
            message: "Type de question invalide"
        });
    }

    if (!Array.isArray(question.reponses) ||
        question.reponses.length < 2 ||
        question.reponses.length > 5 ||
        (question.type === "vrai_faux" && question.reponses.length !== 2)) {

        return res.status(400).json({
            ok: false,
            message: "Nombre de réponses invalide"
        });
    }

    if (question.reponses.some(reponse =>
        !reponse ||
        typeof reponse.texte !== "string" ||
        !reponse.texte.trim() ||
        typeof reponse.est_correcte !== "boolean"
    )) {
        return res.status(400).json({
            ok: false,
            message: "Une réponse est invalide"
        });
    }

    const nombreCorrectes = question.reponses.filter(
        reponse => reponse.est_correcte
    ).length;

    if (nombreCorrectes !== 1) {
        return res.status(400).json({
            ok: false,
            message: "Chaque question doit avoir exactement une bonne réponse"
        });
    }
}

   try {
    db.exec("BEGIN TRANSACTION");

   const resultatQuiz = db.prepare(`
    INSERT INTO quiz (titre, description, createur_id, publie)
    VALUES (?, ?, ?, 1)
`).run(
    titre.trim(),
    description?.trim() ?? "",
    req.utilisateur.id
);

    const quizId = Number(resultatQuiz.lastInsertRowid);

    const insertionQuestion = db.prepare(`
        INSERT INTO questions (quiz_id, enonce, type, ordre)
        VALUES (?, ?, ?, ?)
    `);

    const insertionReponse = db.prepare(`
        INSERT INTO reponses (question_id, texte, est_correcte, ordre)
        VALUES (?, ?, ?, ?)
    `);

    questions.forEach((question, indexQuestion) => {

        const resultatQuestion = insertionQuestion.run(
            quizId,
            question.enonce.trim(),
            question.type,
            indexQuestion
        );

        const questionId = Number(resultatQuestion.lastInsertRowid);

        question.reponses.forEach((reponse, indexReponse) => {
            insertionReponse.run(
                questionId,
                reponse.texte.trim(),
                reponse.est_correcte ? 1 : 0,
                indexReponse
            );
        });
    });

    db.exec("COMMIT");

    res.status(201).json({
        ok: true,
        quiz_id: quizId,
        message: "Quiz complet enregistré"
    });

} catch (erreur) {

    if (db.isTransaction) {
        db.exec("ROLLBACK");
    }

    console.error(erreur);

    res.status(500).json({
        ok: false,
        message: "Erreur pendant l'enregistrement du quiz"
    });
}

});

app.get('/api/quiz', verifierEnseignant, (req, res) => {

    const quiz = db.prepare(`
        SELECT id, titre, publie, date_creation
        FROM quiz
        WHERE createur_id = ?
        ORDER BY date_creation DESC, id DESC
    `).all(req.utilisateur.id);

    res.json({
        ok: true,
        quiz: quiz
    });

});

app.delete('/api/quiz/:quizId', verifierEnseignant, (req, res) => {

    const quizId = Number(req.params.quizId);

    if (!Number.isSafeInteger(quizId) || quizId <= 0) {
        return res.status(400).json({
            ok: false,
            message: "Identifiant de quiz invalide"
        });
    }

    const resultat = db.prepare(`
        DELETE FROM quiz
        WHERE id = ? AND createur_id = ?
    `).run(quizId, req.utilisateur.id);

    if (resultat.changes === 0) {
        return res.status(404).json({
            ok: false,
            message: "Quiz introuvable"
        });
    }

    res.json({
        ok: true,
        message: "Quiz supprimé"
    });

});

app.listen(3000, () => console.log('http://localhost:3000/Accueil.html'));