const parametres = new URLSearchParams(window.location.search);
const quizId = Number(parametres.get("quiz"));
const formulaire = document.getElementById("formQuestion");
const champs = document.getElementById("champs");
const selection = document.getElementById("selection");
const enonce = document.getElementById("enonce");
const type = document.getElementById("type");
const options = document.getElementById("options");
const ajouter = document.getElementById("ajouter");
const enlever = document.getElementById("enlever");
const message = document.getElementById("message");
let questions = [];

async function appelerApi(chemin, methode = "GET", contenu) {
    const headers = { Authorization: "Bearer " + localStorage.getItem("token") };
    if (contenu) headers["Content-Type"] = "application/json";
    const reponse = await fetch(chemin, { method: methode, headers, body: JSON.stringify(contenu) });
    if (reponse.status === 401) {
        localStorage.removeItem("token");
        window.location.replace("/Accueil.html");
        throw new Error("Reconnecte-toi pour continuer.");
    }
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.message);
    return resultat;
}

function afficherErreur(erreur) {
    message.textContent = erreur instanceof TypeError ? "Impossible de communiquer avec le serveur." : erreur.message;
}

function reglerBoutonsOptions() {
    document.getElementById("actionsOptions").hidden = type.value === "vrai_faux";
    enlever.disabled = options.children.length <= 2;
    ajouter.disabled = options.children.length >= 6;
}

function ajouterOption(texte, correcte) {
    const ligne = document.getElementById("modeleOption").content.firstElementChild.cloneNode(true);
    const numero = options.children.length + 1;
    const radio = ligne.querySelector('input[type="radio"]');
    const saisie = ligne.querySelector('input[type="text"]');
    radio.checked = correcte;
    radio.setAttribute("aria-label", "Bonne réponse " + numero);
    saisie.value = texte;
    saisie.readOnly = type.value === "vrai_faux";
    saisie.setAttribute("aria-label", "Option " + numero);
    options.appendChild(ligne);
}

function questionSelectionnee() {
    return questions.find(q => q.id === Number(selection.value));
}

function afficherOptions() {
    const question = questionSelectionnee();
    options.replaceChildren();
   if (question && type.value === question.type) {
        question.options.forEach(option => ajouterOption(option.texte, option.correcte));
    } else if (type.value === "vrai_faux") {
        ajouterOption("Vrai", false);
        ajouterOption("Faux", false);
    } else {
        ajouterOption("", false);
        ajouterOption("", false);
    }
    reglerBoutonsOptions();
}

function afficherQuestion() {
    const question = questionSelectionnee();
    enonce.value = question?.enonce ?? "";
    type.value = question?.type ?? "choix_multiples";
    afficherOptions();

    document.getElementById("supprimer").hidden = !question;
    formulaire.querySelector('button[type="submit"]').textContent = question
        ? "Enregistrer les modifications"
        : "Enregistrer la nouvelle question";

    const url = "?quiz=" + quizId;
    history.replaceState(null, "", question ? url + "&question=" + question.id : url);
}

function afficherListe(id) {
    selection.replaceChildren();
    for (const [i, question] of questions.entries()) {
        selection.add(new Option((i + 1) + ". " + question.enonce, question.id));
    }
    selection.add(new Option("Nouvelle question", ""));
    if (id) selection.value = id;
    formulaire.hidden = false;
    afficherQuestion();
}

document.getElementById("nouvelleQuestion").addEventListener("click", () => {
    selection.value = "";
    afficherQuestion();
    message.textContent = "";
    enonce.focus();
});

async function charger() {
    if (!localStorage.getItem("token")) {
        window.location.replace("/Accueil.html");
        return;
    }
    if (!Number.isSafeInteger(quizId) || quizId <= 0) throw new Error("Identifiant du quiz invalide.");
    const session = await appelerApi("/api/verifier-token");
    if (session.utilisateur.role !== "enseignant") throw new Error("Cette page est réservée aux enseignants.");

    const { quiz } = await appelerApi("/api/quiz/" + quizId);
    document.getElementById("titreQuiz").textContent = quiz.titre;
    questions = quiz.questions;
    const id = parametres.get("question");
    if (id !== null && !questions.some(q => String(q.id) === id)) {
        throw new Error("Cette question ne figure plus dans le quiz.");
    }
    message.textContent = "";
    afficherListe(id);
}

selection.addEventListener("change", () => {
    message.textContent = "";
    afficherQuestion();
});
type.addEventListener("change", afficherOptions);
ajouter.addEventListener("click", () => {
    ajouterOption("", false);
    reglerBoutonsOptions();
});
enlever.addEventListener("click", () => {
    options.lastElementChild.remove();
    reglerBoutonsOptions();
});

formulaire.addEventListener("submit", async evenement => {
    evenement.preventDefault();
    const id = selection.value;
    const choix = Array.from(options.children, ligne => ({
        texte: ligne.querySelector('input[type="text"]').value.trim(),
        correcte: ligne.querySelector('input[type="radio"]').checked
    }));
    champs.disabled = true;
    try {
       const chemin = id ? "/api/questions/" + id : "/api/quiz/" + quizId + "/questions";
const resultat = await appelerApi(chemin, id ? "PUT" : "POST", {
    enonce: enonce.value.trim(),
    type: type.value,
    options: choix
});

questions = resultat.quiz.questions;
afficherListe(id || resultat.question_id);
message.textContent = id ? "Modifications enregistrées." : "Question ajoutée.";
    } catch (erreur) {
        afficherErreur(erreur);
    } finally {
        champs.disabled = false;
    }
});

document.getElementById("supprimer").addEventListener("click", async () => {
    const question = questionSelectionnee();
    if (!confirm("Supprimer la question « " + question.enonce + " » ?")) return;
    champs.disabled = true;
    try {
        await appelerApi("/api/questions/" + question.id, "DELETE");
        questions = questions.filter(q => q.id !== question.id);
        message.textContent = "Question supprimée.";
        afficherListe();
    } catch (erreur) {
        afficherErreur(erreur);
    } finally {
        champs.disabled = false;
    }
});

charger().catch(afficherErreur);
