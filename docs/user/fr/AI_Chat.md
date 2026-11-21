# L’assistant IA

Alviss intègre un chat dans l’éditeur. Il répond à partir de la note que vous lisez,
affiche la réponse au fil de son écriture et parle directement au fournisseur de
modèle que vous configurez. Alviss n’exploite aucun service d’IA et ne fait jamais
transiter vos requêtes par un serveur.

## Ouvrir le chat

Cliquez sur **Ouvrir le chat** en haut de la barre latérale gauche, appuyez sur **⌘⇧K**, ou ouvrez
la palette de commandes (**⌘K**) et choisissez **Ouvrir le chat**. Le chat s’ancre à droite de la
note, pour lire et demander en même temps. Faites glisser le séparateur pour changer sa largeur ;
la largeur est mémorisée par fenêtre. Fermez avec le **×** de l’en-tête, ou **⌘⇧K** à nouveau.

La première fois, il s’ouvre sur la liste des fournisseurs, faute de quoi que ce soit à qui parler.

## Choisir un fournisseur

Alviss n’embarque aucun modèle. Vous le pointez vers un :

| Fournisseur | Où il tourne | Clé |
|---|---|---|
| OpenAI | dans le cloud | oui |
| Anthropic | dans le cloud | oui |
| DeepSeek | dans le cloud | oui |
| Ollama | sur ce Mac | non |
| LM Studio | sur ce Mac | non |
| Serveur personnel | n’importe où | selon le cas |

**Serveur personnel** est le cas général : tout point d’accès qui parle le protocole de chat
d’OpenAI. Donnez-lui un nom, son adresse (par exemple `https://your-server/v1`) et, s’il en veut
une, un jeton. Un serveur sur cette machine peut utiliser `http` simple ; toute autre adresse doit
être en `https`.

**Tester la connexion** demande au fournisseur sa liste de modèles et la propose sous le champ
modèle, pour ne pas saisir un identifiant de mémoire.

Un fournisseur ajouté reste modifiable : son nom, son adresse, son modèle et sa clé peuvent être
changés plus tard, et **Supprimer** l’efface avec sa clé.

## Votre clé

La clé est conservée dans le trousseau de macOS et lue par le processus natif de l’application au
moment d’une requête. Elle n’est plus jamais affichée — ni dans le panneau, ni dans les réglages, ni
dans un journal — et n’est jamais écrite dans votre coffre. Deux fournisseurs différents peuvent
détenir des clés différentes.

*Supprimer* efface aussi la clé du trousseau.

## Ce qui est envoyé

Ce dont la question a besoin :

1. Une courte consigne décrivant le rôle de l’assistant.
2. La note que vous lisez, quand **Note actuelle** est activée. Passez à **Sans note** pour n’envoyer que la question.
3. La conversation jusqu’ici.

Une note longue est coupée à une limite fixe avant l’envoi. Rien d’autre ne quitte la machine :
aucune liste de coffre, aucun nom de fichier, aucun réglage.

## Les réponses

La réponse apparaît au fil de l’écriture et reste dans la conversation une fois terminée.
**Arrêter** interrompt une réponse en pleine phrase et garde ce qui est arrivé.

Les réponses sont rendues en Markdown, entièrement échappées : un modèle qui écrit du HTML produit
du texte, pas une page.

**Nouvelle conversation** vide le panneau. La dernière conversation est mémorisée par coffre et
revient à la réouverture du chat.

La ligne sous la zone de saisie porte le sélecteur de fournisseur à gauche et **Envoyer** à droite,
pour que la zone de saisie occupe toute la largeur du panneau.

Saisissez dans la zone en bas du panneau. **Entrée** envoie, **Maj+Entrée** commence une nouvelle
ligne ; pendant qu’une méthode de saisie chinoise ou japonaise compose, Entrée appartient aux
candidats, pas au chat. Faites glisser la barre au-dessus de la zone pour l’agrandir — la hauteur
est mémorisée.

Le bouton **Aa** de l’en-tête fait défiler la taille du texte (petite, par défaut, grande), et le
choix est mémorisé pour la conversation suivante.

## Quand quelque chose échoue

Le message nomme le remède, pas seulement la panne :

| Message | Que faire |
|---|---|
| Le fournisseur a refusé la clé | ouvrir **Fournisseurs**, saisir une nouvelle clé |
| Le fournisseur ne connaît pas ce modèle | vérifier l’identifiant ; utiliser **Tester la connexion** pour les lister |
| Le fournisseur limite cette clé | patienter un instant |
| La note et la question ne tiennent pas | couper le contexte, ou choisir un modèle à fenêtre plus large |
| Le fournisseur est injoignable | vérifier l’adresse et votre connexion |

## Ce que l’assistant ne fait pas

Il n’écrit pas dans votre coffre. Il n’a pas d’outils, pas d’accès internet propre et ne peut pas
modifier un fichier. Une modification directe reste votre affaire.
