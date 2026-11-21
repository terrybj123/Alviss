# Der KI-Assistent

Alviss hat einen Chat im Editor. Er antwortet aus der Notiz, die Sie gerade lesen,
schreibt die Antwort mit, während sie entsteht, und spricht direkt mit dem
Modellanbieter, den Sie einrichten. Alviss betreibt keinen eigenen KI-Dienst und
leitet Ihre Anfragen nie über einen Server.

## Den Chat öffnen

Klicken Sie oben in der linken Seitenleiste auf **Chat öffnen**, drücken Sie **⌘⇧K**, oder öffnen
Sie die Befehlspalette (**⌘K**) und wählen Sie **Chat öffnen**. Der Chat dockt rechts neben der
Notiz an, sodass Sie lesen und fragen können. Ziehen Sie den Trenner, um die Breite zu ändern; die
Breite wird pro Fenster gemerkt. Schließen mit **×** in der Kopfzeile oder erneut **⌘⇧K**.

Beim ersten Mal öffnet er sich auf der Anbieterliste, weil es noch nichts zu bereden gibt.

## Einen Anbieter wählen

Alviss bringt kein eigenes Modell mit. Sie richten es auf eines:

| Anbieter | Läuft | Schlüssel |
|---|---|---|
| OpenAI | in der Cloud | ja |
| Anthropic | in der Cloud | ja |
| DeepSeek | in der Cloud | ja |
| Ollama | auf diesem Mac | nein |
| LM Studio | auf diesem Mac | nein |
| Eigener Server | überall | kommt darauf an |

**Eigener Server** ist der allgemeine Fall: jeder Endpunkt, der das OpenAI-Chat-Protokoll spricht.
Geben Sie einen Namen an, die Adresse (zum Beispiel `https://your-server/v1`) und, falls nötig,
ein Token. Ein Server auf diesem Rechner darf einfaches `http` verwenden; jede andere Adresse muss
`https` sein.

**Verbindung testen** fragt den Anbieter nach seiner Modellliste und bietet sie unter dem
Modellfeld an, sodass Sie keine Modell-ID aus dem Gedächtnis tippen müssen.

Ein hinzugefügter Anbieter bleibt bearbeitbar: Name, Adresse, Modell und Schlüssel lassen sich
später ändern, und **Entfernen** löscht ihn samt Schlüssel.

## Ihr Schlüssel

Der Schlüssel liegt im Schlüsselbund von macOS und wird vom nativen Prozess der Anwendung gelesen,
wenn eine Anfrage gestellt wird. Er wird nie wieder angezeigt — nicht im Panel, nicht in den
Einstellungen, nicht in einem Protokoll — und nie in Ihren Vault geschrieben. Zwei verschiedene
Anbieter können verschiedene Schlüssel halten.

*Entfernen* löscht den Schlüssel auch aus dem Schlüsselbund.

## Was gesendet wird

Was die Frage braucht:

1. Eine kurze Anweisung, die die Rolle des Assistenten beschreibt.
2. Die Notiz, die Sie lesen, wenn **Aktuelle Notiz** eingeschaltet ist. Schalten Sie auf **Ohne Notiz**, um nur die Frage zu senden.
3. Die bisherige Unterhaltung.

Eine lange Notiz wird vor dem Senden an einer festen Grenze gekürzt. Sonst verlässt nichts den
Rechner: keine Vault-Liste, keine Dateinamen, keine Einstellungen.

## Antworten

Die Antwort erscheint, während sie geschrieben wird, und bleibt nach dem Ende in der Unterhaltung.
**Stoppen** beendet eine Antwort mitten im Satz und behält, was angekommen ist.

Antworten werden als Markdown dargestellt, alles maskiert: Ein Modell, das HTML schreibt, erzeugt
Text, keine Seite.

**Neue Unterhaltung** leert das Panel. Die letzte Unterhaltung wird pro Vault gemerkt und kommt
zurück, wenn Sie den Chat erneut öffnen.

Die Zeile unter dem Eingabefeld trägt links den Anbieterwechsel und rechts **Senden**, sodass das
Feld die volle Breite des Panels einnimmt.

Tippen Sie in das Eingabefeld unten im Panel. **Enter** sendet, **Shift+Enter** beginnt eine neue
Zeile; während eine chinesische oder japanische Eingabemethode zusammensetzt, gehört Enter den
Kandidaten, nicht dem Chat. Ziehen Sie den Balken über dem Feld nach oben, um es höher zu machen —
die Höhe wird gemerkt.

Die Schaltfläche **Aa** in der Kopfzeile schaltet die Textgröße um (klein, Standard, groß), und die
Wahl wird für die nächste Unterhaltung gemerkt.

## Wenn etwas schiefgeht

Die Meldung nennt die Abhilfe, nicht nur den Fehler:

| Meldung | Was zu tun ist |
|---|---|
| Der Anbieter hat den Schlüssel abgelehnt | **Anbieter** öffnen und einen neuen Schlüssel eingeben |
| Der Anbieter kennt dieses Modell nicht | Modell-ID prüfen; mit **Verbindung testen** die Liste holen |
| Der Anbieter begrenzt diesen Schlüssel | einen Moment warten |
| Notiz und Frage passen nicht | Kontext abschalten oder ein Modell mit größerem Fenster wählen |
| Der Anbieter war nicht erreichbar | Adresse und Verbindung prüfen |

## Was der Assistent nicht tut

Er schreibt nicht in Ihren Vault. Er hat keine Werkzeuge, keinen eigenen Internetzugang und kann
keine Datei ändern. Eine direkte Änderung bleibt Ihre Sache.
