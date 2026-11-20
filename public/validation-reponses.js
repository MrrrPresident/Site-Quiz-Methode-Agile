// reponses associe l'identifiant de chaque question à l'identifiant de l'option choisie.
function validerReponses(questions, reponses) {
    if (questions.length === 0) return "Ce quiz ne contient aucune question.";
    if (!reponses || typeof reponses !== "object" || Array.isArray(reponses)) {
        return "Réponds à toutes les questions avant de soumettre le quiz.";
    }

    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const choix = reponses[question.id];
        if (choix === undefined || choix === null || choix === "") {
            return "Réponds à la question " + (i + 1) + " avant de soumettre le quiz.";
        }
        // Les boutons radio donnent des chaînes, tandis que l'API fournit des nombres.
        const valide = question.options.some(option => choix === option.id || choix === String(option.id));
        if (!valide) return "Choisis une des réponses proposées à la question " + (i + 1) + ".";
    }
    return null;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = validerReponses;
}
