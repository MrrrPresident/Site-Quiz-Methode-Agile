const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || "cle-secrete-projet-quiz";

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ======================= BASE DE DONNÉES =======================
const db = new DatabaseSync(path.join(__dirname, 'quiz.db'));
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    mot_de_passe TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    auteur_id INTEGER NOT NULL,
    publie INTEGER NOT NULL DEFAULT 0,
    cree_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auteur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    enonce TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('choix_multiples', 'vrai_faux')),
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (quiz_id) REFERENCES quiz(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    texte TEXT NOT NULL,
    correcte INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resultats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    eleve_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quiz(id) ON DELETE CASCADE,
    FOREIGN KEY (eleve_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
);
`);

// Ajout de la colonne "role" si elle n'existe pas encore (anciennes bases)
try {
    db.exec(`ALTER TABLE utilisateurs ADD COLUMN role TEXT NOT NULL DEFAULT 'eleve'`);
} catch (e) { /* la colonne existe déjà */ }

// L'enseignant n'est créé qu'une seule fois
const hash = bcrypt.hashSync('Farid', 10);
db.prepare(`INSERT OR IGNORE INTO utilisateurs (nom, mot_de_passe, role) VALUES (?, ?, 'enseignant')`)
  .run('Farid', hash);
db.prepare(`UPDATE utilisateurs SET role = 'enseignant' WHERE nom = 'Farid'`).run();

// ======================= OUTILS =======================
function transaction(fn) {
    db.exec('BEGIN');
    try {
        const r = fn();
        db.exec('COMMIT');
        return r;
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}

// Middleware : vérifie le token JWT
function authentifier(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ ok: false, message: "Token manquant" });
    const token = authHeader.split(" ")[1];
    try {
        req.utilisateur = jwt.verify(token, SECRET_KEY);
        next();
    } catch {
        res.status(401).json({ ok: false, message: "Token invalide ou expiré" });
    }
}

// Middleware : réserve la route à un rôle
function exigerRole(role) {
    return (req, res, next) => {
        if (req.utilisateur.role !== role) {
            return res.status(403).json({ ok: false, message: "Accès refusé" });
        }
        next();
    };
}

// Valide une question et ses options. Retourne un message d'erreur ou null.
function validerQuestion({ enonce, type, options }) {
    if (!enonce || !enonce.trim()) return "L'énoncé est obligatoire";
    if (!['choix_multiples', 'vrai_faux'].includes(type)) return "Type de question invalide";
    if (!Array.isArray(options)) return "Les options sont obligatoires";

    if (type === 'vrai_faux' && options.length !== 2) return "Une question Vrai/Faux a exactement 2 options";
    if (type === 'choix_multiples' && (options.length < 2 || options.length > 6)) {
        return "Une question à choix multiples a entre 2 et 6 options";
    }
    if (options.some(o => !o.texte || !String(o.texte).trim())) return "Chaque option doit avoir un texte";
    if (options.filter(o => o.correcte).length !== 1) return "Il doit y avoir exactement une bonne réponse";
    return null;
}

// Charge un quiz complet. avecReponses = false cache les bonnes réponses (élèves).
function chargerQuiz(id, avecReponses) {
    const quiz = db.prepare(`SELECT id, titre, auteur_id, publie, cree_le FROM quiz WHERE id = ?`).get(id);
    if (!quiz) return null;
    const questions = db.prepare(`SELECT id, enonce, type, position FROM questions WHERE quiz_id = ? ORDER BY position, id`).all(id);
    for (const q of questions) {
        const opts = db.prepare(`SELECT id, texte, correcte FROM options WHERE question_id = ? ORDER BY id`).all(q.id);
        q.options = opts.map(o => avecReponses
            ? { id: o.id, texte: o.texte, correcte: !!o.correcte }
            : { id: o.id, texte: o.texte });
    }
    quiz.publie = !!quiz.publie;
    quiz.questions = questions;
    return quiz;
}

function insererQuestion(quizId, q) {
    const pos = db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM questions WHERE quiz_id = ?`).get(quizId).p;
    const r = db.prepare(`INSERT INTO questions (quiz_id, enonce, type, position) VALUES (?, ?, ?, ?)`)
        .run(quizId, q.enonce.trim(), q.type, pos);
    const questionId = Number(r.lastInsertRowid);
    const ins = db.prepare(`INSERT INTO options (question_id, texte, correcte) VALUES (?, ?, ?)`);
    for (const o of q.options) ins.run(questionId, String(o.texte).trim(), o.correcte ? 1 : 0);
    return questionId;
}

// Vérifie que le quiz existe et appartient à l'enseignant connecté
function quizDeLEnseignant(req, res) {
    const quiz = db.prepare(`SELECT * FROM quiz WHERE id = ?`).get(req.params.id);
    if (!quiz) { res.status(404).json({ ok: false, message: "Quiz introuvable" }); return null; }
    if (quiz.auteur_id !== req.utilisateur.id) {
        res.status(403).json({ ok: false, message: "Ce quiz ne vous appartient pas" });
        return null;
    }
    return quiz;
}

// ======================= AUTHENTIFICATION =======================
app.post('/api/connexion', async (req, res) => {
    const { usager, password, role } = req.body; // role optionnel : "eleve" ou "enseignant"

    const row = db.prepare(`SELECT * FROM utilisateurs WHERE nom = ?`).get(usager);

    if (!row || !(await bcrypt.compare(password || '', row.mot_de_passe))) {
        return res.status(401).json({ ok: false, message: "L'usager ou le mot de passe est incorrect" });
    }
    if (role && role !== row.role) {
        return res.status(401).json({ ok: false, message: `Ce compte n'est pas un compte ${role}` });
    }

    const token = jwt.sign({ id: row.id, nom: row.nom, role: row.role }, SECRET_KEY, { expiresIn: "1h" });
    res.json({ ok: true, token, role: row.role });
});

app.get('/api/verifier-token', authentifier, (req, res) => {
    res.json({ ok: true, utilisateur: req.utilisateur });
});

// L'enseignant crée des comptes élèves
app.post('/api/eleves', authentifier, exigerRole('enseignant'), async (req, res) => {
    const { nom, password } = req.body;
    if (!nom || !password || password.length < 4) {
        return res.status(400).json({ ok: false, message: "Nom et mot de passe (4 caractères min.) requis" });
    }
    try {
        const h = await bcrypt.hash(password, 10);
        const r = db.prepare(`INSERT INTO utilisateurs (nom, mot_de_passe, role) VALUES (?, ?, 'eleve')`).run(nom.trim(), h);
        res.status(201).json({ ok: true, id: Number(r.lastInsertRowid), nom: nom.trim() });
    } catch {
        res.status(409).json({ ok: false, message: "Ce nom d'usager existe déjà" });
    }
});

// ======================= QUIZ =======================
app.get('/api/quiz', authentifier, (req, res) => {
    const sql = req.utilisateur.role === 'enseignant'
        ? db.prepare(`SELECT q.id, q.titre, q.publie, q.cree_le,
                      (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS nb_questions
                      FROM quiz q WHERE q.auteur_id = ? ORDER BY q.id DESC`).all(req.utilisateur.id)
        : db.prepare(`SELECT q.id, q.titre, q.publie, q.cree_le,
                      (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS nb_questions
                      FROM quiz q WHERE q.publie = 1 ORDER BY q.id DESC`).all();
    res.json({ ok: true, quiz: sql.map(q => ({ ...q, publie: !!q.publie })) });
});

app.get('/api/quiz/:id', authentifier, (req, res) => {
    const estEnseignant = req.utilisateur.role === 'enseignant';
    const quiz = chargerQuiz(req.params.id, estEnseignant);
    if (!quiz) return res.status(404).json({ ok: false, message: "Quiz introuvable" });

    if (estEnseignant && quiz.auteur_id !== req.utilisateur.id) {
        return res.status(403).json({ ok: false, message: "Ce quiz ne vous appartient pas" });
    }
    if (!estEnseignant && !quiz.publie) {
        return res.status(403).json({ ok: false, message: "Ce quiz n'est pas publié" });
    }
    res.json({ ok: true, quiz });
});

app.post('/api/quiz', authentifier, exigerRole('enseignant'), (req, res) => {
    const { titre, questions } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ ok: false, message: "Le titre est obligatoire" });

    if (questions !== undefined) {
        if (!Array.isArray(questions)) return res.status(400).json({ ok: false, message: "questions doit être un tableau" });
        for (const [i, q] of questions.entries()) {
            const err = validerQuestion(q);
            if (err) return res.status(400).json({ ok: false, message: `Question ${i + 1} : ${err}` });
        }
    }

    const id = transaction(() => {
        const r = db.prepare(`INSERT INTO quiz (titre, auteur_id) VALUES (?, ?)`).run(titre.trim(), req.utilisateur.id);
        const quizId = Number(r.lastInsertRowid);
        (questions || []).forEach(q => insererQuestion(quizId, q));
        return quizId;
    });
    res.status(201).json({ ok: true, quiz: chargerQuiz(id, true) });
});

app.put('/api/quiz/:id', authentifier, exigerRole('enseignant'), (req, res) => {
    const quiz = quizDeLEnseignant(req, res);
    if (!quiz) return;
    const { titre } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ ok: false, message: "Le titre est obligatoire" });
    db.prepare(`UPDATE quiz SET titre = ? WHERE id = ?`).run(titre.trim(), quiz.id);
    res.json({ ok: true, quiz: chargerQuiz(quiz.id, true) });
});

app.delete('/api/quiz/:id', authentifier, exigerRole('enseignant'), (req, res) => {
    const quiz = quizDeLEnseignant(req, res);
    if (!quiz) return;
    db.prepare(`DELETE FROM quiz WHERE id = ?`).run(quiz.id);
    res.json({ ok: true });
});

app.post('/api/quiz/:id/publier', authentifier, exigerRole('enseignant'), (req, res) => {
    const quiz = quizDeLEnseignant(req, res);
    if (!quiz) return;
    const n = db.prepare(`SELECT COUNT(*) AS n FROM questions WHERE quiz_id = ?`).get(quiz.id).n;
    if (n === 0) return res.status(400).json({ ok: false, message: "Ajoutez au moins une question avant de publier" });
    db.prepare(`UPDATE quiz SET publie = 1 WHERE id = ?`).run(quiz.id);
    res.json({ ok: true, message: "Quiz publié" });
});

app.post('/api/quiz/:id/depublier', authentifier, exigerRole('enseignant'), (req, res) => {
    const quiz = quizDeLEnseignant(req, res);
    if (!quiz) return;
    db.prepare(`UPDATE quiz SET publie = 0 WHERE id = ?`).run(quiz.id);
    res.json({ ok: true, message: "Quiz dépublié" });
});

// ======================= QUESTIONS =======================
app.post('/api/quiz/:id/questions', authentifier, exigerRole('enseignant'), (req, res) => {
    const quiz = quizDeLEnseignant(req, res);
    if (!quiz) return;
    const err = validerQuestion(req.body);
    if (err) return res.status(400).json({ ok: false, message: err });

    const qid = transaction(() => insererQuestion(quiz.id, req.body));
    res.status(201).json({ ok: true, question_id: qid, quiz: chargerQuiz(quiz.id, true) });
});

function questionDeLEnseignant(req, res) {
    const q = db.prepare(`SELECT q.*, z.auteur_id FROM questions q JOIN quiz z ON z.id = q.quiz_id WHERE q.id = ?`)
        .get(req.params.id);
    if (!q) { res.status(404).json({ ok: false, message: "Question introuvable" }); return null; }
    if (q.auteur_id !== req.utilisateur.id) {
        res.status(403).json({ ok: false, message: "Cette question ne vous appartient pas" });
        return null;
    }
    return q;
}

app.put('/api/questions/:id', authentifier, exigerRole('enseignant'), (req, res) => {
    const q = questionDeLEnseignant(req, res);
    if (!q) return;
    const err = validerQuestion(req.body);
    if (err) return res.status(400).json({ ok: false, message: err });

    transaction(() => {
        db.prepare(`UPDATE questions SET enonce = ?, type = ? WHERE id = ?`)
            .run(req.body.enonce.trim(), req.body.type, q.id);
        db.prepare(`DELETE FROM options WHERE question_id = ?`).run(q.id);
        const ins = db.prepare(`INSERT INTO options (question_id, texte, correcte) VALUES (?, ?, ?)`);
        for (const o of req.body.options) ins.run(q.id, String(o.texte).trim(), o.correcte ? 1 : 0);
    });
    res.json({ ok: true, quiz: chargerQuiz(q.quiz_id, true) });
});

app.delete('/api/questions/:id', authentifier, exigerRole('enseignant'), (req, res) => {
    const q = questionDeLEnseignant(req, res);
    if (!q) return;
    db.prepare(`DELETE FROM questions WHERE id = ?`).run(q.id);
    res.json({ ok: true });
});

// ======================= RÉPONSES DES ÉLÈVES =======================
// Corps : { "reponses": { "<id_question>": <id_option>, ... } }
app.post('/api/quiz/:id/soumettre', authentifier, exigerRole('eleve'), (req, res) => {
    const quiz = chargerQuiz(req.params.id, true);
    if (!quiz || !quiz.publie) return res.status(404).json({ ok: false, message: "Quiz introuvable" });

    const reponses = req.body.reponses || {};
    let score = 0;
    const detail = quiz.questions.map(q => {
        const bonne = q.options.find(o => o.correcte);
        const choisie = Number(reponses[q.id]);
        const juste = choisie === bonne.id;
        if (juste) score++;
        return { question_id: q.id, option_choisie: choisie || null, bonne_option: bonne.id, juste };
    });

    db.prepare(`INSERT INTO resultats (quiz_id, eleve_id, score, total) VALUES (?, ?, ?, ?)`)
        .run(quiz.id, req.utilisateur.id, score, quiz.questions.length);

    res.json({ ok: true, score, total: quiz.questions.length, detail });
});

app.get('/api/quiz/:id/resultats', authentifier, exigerRole('enseignant'), (req, res) => {
    const quiz = quizDeLEnseignant(req, res);
    if (!quiz) return;
    const rows = db.prepare(`SELECT r.id, u.nom AS eleve, r.score, r.total, r.date
                             FROM resultats r JOIN utilisateurs u ON u.id = r.eleve_id
                             WHERE r.quiz_id = ? ORDER BY r.date DESC`).all(quiz.id);
    res.json({ ok: true, resultats: rows });
});

app.get('/api/mes-resultats', authentifier, exigerRole('eleve'), (req, res) => {
    const rows = db.prepare(`SELECT r.id, z.titre, r.score, r.total, r.date
                             FROM resultats r JOIN quiz z ON z.id = r.quiz_id
                             WHERE r.eleve_id = ? ORDER BY r.date DESC`).all(req.utilisateur.id);
    res.json({ ok: true, resultats: rows });
});

app.listen(3000, () => console.log('http://localhost:3000/Accueil.html'));
