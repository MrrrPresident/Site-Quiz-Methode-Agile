// Affiche le contenu de quiz.db en clair.
// quiz.db n'est pas chiffré : c'est un fichier SQLite binaire, illisible dans un éditeur de texte.
// Les mots de passe sont hachés avec bcrypt (irréversible) : c'est voulu, on ne peut pas les relire.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'quiz.db'), { readOnly: true });
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all();

for (const { name } of tables) {
    console.log(`\n=== ${name} ===`);
    const lignes = db.prepare(`SELECT * FROM "${name}"`).all();
    if (lignes.length === 0) console.log('(vide)');
    else console.table(lignes);
}
