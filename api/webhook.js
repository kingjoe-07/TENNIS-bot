const TOKEN = "8972644636:AAG4XMBBgp8BVdWJuwLfGhOrRVxZD6y8vMA";

function detecterOverUnder(stats, circuit = "WTA") {
  const sg = parseFloat(stats.serviceGames) || 65;
  const rg = parseFloat(stats.returnGames) || 35;
  const bpW = parseFloat(stats.bpWon) || 40;
  const bpS = parseFloat(stats.bpSaved) || 50;
  const g2 = parseFloat(stats.pctGagne2em) || 50;
  const dr = parseFloat(stats.dominanceRatio) || 1;

  let sO = circuit === "WTA" ? 3 : 1;
  let sU = circuit === "ATP" ? 2 : 0;

  if (stats.surface === "Terre battue") sO += 2;
  else if (stats.surface === "Gazon") { sO -= 1; sU += 3; }
  else sO += 1;

  if (circuit === "ATP") {
    if (sg >= 85) sU += 3; else if (sg >= 78) sU += 2; else if (sg <= 60) sO += 2;
  } else {
    if (sg >= 85) sU += 2; else if (sg >= 78) sU += 1;
    else if (sg <= 60) sO += 2; else if (sg <= 68) sO += 1;
  }

  if (g2 <= 48) sO += 2; else if (g2 <= 52) sO += 1; else if (g2 >= 62) sU += 1;
  if (rg >= 45) sO += 3; else if (rg >= 35) sO += 2; else if (rg >= 25) sO += 1; else if (rg <= 15) sU += 2;
  if (bpW >= 55) sO += 2; else if (bpW >= 45) sO += 1; else if (bpW <= 25) sU += 2;
  if (bpS <= 45) sO += 2; else if (bpS >= 70) sU += 1;
  if (dr >= 1.5) sU += 1; else if (dr <= 0.85) sO += 1;

  const total = Math.max(1, sO + sU);
  let pctOver = Math.round((sO / total) * 100);
  pctOver = Math.min(85, Math.max(20, pctOver));
  const pctUnder = 100 - pctOver;

  let recommandation, explication;
  if (pctOver >= 62) { recommandation = "OVER"; explication = "Breaks frequents attendus - match long probable"; }
  else if (pctUnder >= 62) { recommandation = "UNDER"; explication = "Service dominant - match court probable"; }
  else { recommandation = "NEUTRE"; explication = "Signal equilibre - evite ce pari"; }

  return { recommandation, pctOver, pctUnder, explication };
}

function parserStats(texte) {
  const stats = {};
  const lignes = texte.split("\n");
  for (const ligne of lignes) {
    const l = ligne.toLowerCase();
    const num = ligne.match(/[\d.]+/)?.[0];
    if (!num) continue;
    if (l.includes("dominance")) stats.dominanceRatio = num;
    else if (l.startsWith("aces") || l.startsWith("ace:")) stats.aces = num;
    else if (l.startsWith("df") || l.includes("double")) stats.doubleFautes = num;
    else if (l.includes("1st serve:")) stats.pct1erService = num;
    else if (l.includes("1st pts")) stats.pctGagne1er = num;
    else if (l.includes("2nd pts")) stats.pctGagne2em = num;
    else if (l.includes("bp saved")) stats.bpSaved = num;
    else if (l.includes("service games")) stats.serviceGames = num;
    else if (l.includes("bp won")) stats.bpWon = num;
    else if (l.includes("return games")) stats.returnGames = num;
    if (l.includes("gazon") || l.includes("grass")) stats.surface = "Gazon";
    else if (l.includes("terre") || l.includes("clay")) stats.surface = "Terre battue";
    else if (l.includes("dur") || l.includes("hard")) stats.surface = "Dur";
    if (l.includes("wta")) stats.circuit = "WTA";
    else if (l.includes("atp")) stats.circuit = "ATP";
  }
  return stats;
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const { message } = req.body;
    if (!message?.text) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const texte = message.text;

    if (texte === "/start") {
      await sendMessage(chatId, "Bienvenue sur Tennis Sharp Bot!\n\nEnvoie les stats dans ce format:\n\nDominance: 1.29\nAces: 2\nDF: 7\n1st Serve: 57\n1st Pts Won: 78\n2nd Pts Won: 65\nBP Saved: 50\nService Games: 78\nBP Won: 25\nReturn Games: 30\nSurface: Dur\nCircuit: WTA\n\nTape /aide pour plus d'infos");
    } else if (texte === "/aide") {
      await sendMessage(chatId, "Format des stats (ordre TNNS):\n\nDominance: [valeur]\nAces: [nombre]\nDF: [double fautes]\n1st Serve: [%]\n1st Pts Won: [%]\n2nd Pts Won: [%]\nBP Saved: [%]\nService Games: [%]\nBP Won: [%]\nReturn Games: [%]\nSurface: Gazon / Terre battue / Dur\nCircuit: WTA / ATP");
    } else {
      const stats = parserStats(texte);
      const circuit = stats.circuit || "WTA";
      const nbStats = Object.keys(stats).filter(k => !["surface","circuit"].includes(k)).length;

      if (nbStats < 3) {
        await sendMessage(chatId, "Je n'ai pas pu lire les stats.\n\nTape /aide pour voir le format correct.");
      } else {
        const r = detecterOverUnder(stats, circuit);
        const conseil = r.recommandation === "NEUTRE" ? "Signal faible - passe ton tour" :
          (r.pctOver >= 70 || r.pctUnder >= 70) ? "Signal fort - verifie l'EV+" : "Signal modere - sois prudent";
        await sendMessage(chatId, `TENNIS SHARP ANALYSE\n\n${r.recommandation}\nOver: ${r.pctOver}% | Under: ${r.pctUnder}%\n${r.explication}\n\nSurface: ${stats.surface || "Non precisee"}\nCircuit: ${circuit}\nStats lues: ${nbStats}/10\n\n${conseil}`);
      }
    }
  } catch (e) {
    console.error(e);
  }

  return res.status(200).json({ ok: true });
}
