const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// --- INITIALISATION FIREBASE ---
let serviceAccount;
const secretFilePath = '/etc/secrets/firebase-key.json'; // Chemin Render standard

if (fs.existsSync(secretFilePath)) {
    // Si on est sur Render
    serviceAccount = require(secretFilePath);
    console.log("✅ Chargement de la clé Firebase depuis /etc/secrets/");
} else if (fs.existsSync('./firebase-key.json')) {
    // Si on est en local
    serviceAccount = require('./firebase-key.json');
    console.log("✅ Chargement de la clé Firebase locale");
} else {
    console.error("❌ ERREUR : Impossible de trouver firebase-key.json !");
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
// -------------------------------
const db = admin.firestore();

const app = express();

// --- MIDDLEWARES INDISPENSABLES ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
// ----------------------------------

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// --- CONFIGURATION CORS ---
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder']
}));

app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, (req.body.userId || 'inconnu') + '-' + file.fieldname + '-' + Date.now() + '.jpg')
  }
});
const upload = multer({ storage: storage });

// --- LA ROUTE D'ENVOI KYC ---
app.post('/upload-kyc', upload.fields([
  { name: 'recto', maxCount: 1 },
  { name: 'verso', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]), (req, res) => {
  console.log("--- NOUVELLE REQUÊTE KYC ---");
  console.log("ID Utilisateur :", req.body.userId);
  
  if (!req.files || Object.keys(req.files).length === 0) {
      console.log("❌ AUCUN FICHIER REÇU !");
      return res.status(400).send('Aucun fichier reçu');
  }
  
  res.status(200).send('OK');
});

// Route pour valider un utilisateur dans Firebase
app.post('/valider-kyc/:userId', async (req, res) => {
    const userId = req.params.userId;
    console.log(`⏳ Début de la validation pour : ${userId}`);
    
    try {
        await db.collection('users').doc(userId).update({
            kyc_status: 'VERIFIED',
            cni_number: 'SN-' + Math.floor(Math.random() * 1000000000)
        });
        console.log(`✅ Utilisateur ${userId} validé !`);
        res.status(200).send("Utilisateur validé !");
    } catch (error) {
        console.error("❌ Erreur validation Firebase :", error);
        res.status(500).send("Erreur lors de la validation");
    }
});

app.get('/admin', (req, res) => {
    const uploadDir = path.join(__dirname, 'uploads');
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send("Erreur dossier");

        let html = `
        <html>
        <head>
            <title>FAYALL Admin</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #eef2f5; padding: 30px; }
                .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
                .card { background: white; padding: 15px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                img { width: 100%; height: 200px; object-fit: contain; background: #f8f9fa; border-radius: 8px; margin-bottom: 10px; border: 1px solid #eee; }
                h1 { color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; }
                .btn-valider { background: #28a745; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; margin-top: 15px; width: 100%; font-weight: bold; }
            </style>
            <script>
                function validerUser(userId, btn) {
                    if (userId === 'inconnu') {
                        userId = prompt("ID Firebase de l'utilisateur :");
                        if (!userId) return;
                    }
                    btn.innerText = "Validation en cours...";
                    // FIX : Utilisation du chemin relatif pour Render
                    fetch('/valider-kyc/' + userId, { method: 'POST' })
                    .then(response => {
                        if(response.ok) {
                            btn.innerText = "✅ VALIDÉ";
                            btn.style.background = "#1a73e8";
                            btn.disabled = true;
                        } else {
                            btn.innerText = "Erreur Serveur";
                            btn.style.background = "red";
                        }
                    });
                }
            </script>
        </head>
        <body>
            <h1>🚀 Dashboard KYC FAYALL</h1>
            <div class="grid">`;

        const users = {};
        files.forEach(file => {
            if (!file.startsWith('.')) {
                const userId = file.split('-')[0];
                if (userId) {
                    if (!users[userId]) users[userId] = [];
                    users[userId].push(file);
                }
            }
        });

        const userIds = Object.keys(users);
        if (userIds.length === 0) {
            html += "<p>Aucun document reçu.</p>";
        } else {
            userIds.forEach(userId => {
                html += `<div class="card">
                    <div style="margin-bottom: 10px; font-size: 12px; color: #555;">👤 ID: <strong style="color: ${userId === 'inconnu' ? 'red' : 'black'}">${userId}</strong></div>
                    <div style="display: flex; gap: 10px; overflow-x: auto;">`;
                users[userId].forEach(file => {
                    html += `<a href="/uploads/${file}" target="_blank" style="flex: 1; min-width: 100px;">
                        <img src="/uploads/${file}" />
                    </a>`;
                });
                html += `</div>
                    <button class="btn-valider" onclick="validerUser('${userId}', this)">APPROUVER L'UTILISATEUR</button>
                </div>`;
            });
        }
        html += `</div></body></html>`;
        res.send(html);
    });
});

app.get('/', (req, res) => {
    res.send('<h1>Le serveur FAYALL est en ligne !</h1><p>Accédez à <a href="/admin">/admin</a> pour voir les dossiers.</p>');
});

// --- MOTEUR DE PAIEMENT MARCHAND ---
const PDFDocument = require('pdfkit');

app.post('/pay-merchant', async (req, res) => {
    console.log("--- 🛒 NOUVEAU PAIEMENT MARCHAND ---");
    // On récupère sourceProvider envoyé par le nouveau frontend
    const { userId, merchantId, amount, sourceAccount, sourceProvider, transactionId } = req.body;
    
    try {
        const receiptsDir = path.join(__dirname, 'receipts');
        if (!fs.existsSync(receiptsDir)) {
            fs.mkdirSync(receiptsDir);
        }

        const fileName = `Recu_FAYALL_${transactionId}.pdf`;
        const filePath = path.join(receiptsDir, fileName);
        
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fontSize(24).font('Helvetica-Bold').fillColor('#1a73e8').text('FAYALL', { align: 'center' });
        doc.fontSize(14).fillColor('#555555').text('REÇU DE PAIEMENT MARCHAND', { align: 'center' });
        doc.moveDown(2);
        
        doc.fontSize(12).fillColor('black').font('Helvetica');
        doc.text(`ID Transaction : ${transactionId}`);
        doc.text(`Date : ${new Date().toLocaleString('fr-FR')}`);
        doc.moveDown();
        
        doc.font('Helvetica-Bold').text('Détails du Marchand :');
        doc.font('Helvetica').text(`ID Marchand : ${merchantId}`);
        doc.moveDown();

        doc.font('Helvetica-Bold').text('Détails du Client :');
        doc.font('Helvetica').text(`ID Client : ${userId}`);
        // FIX : On affiche le nom du prestataire (WAVE, Orange Money, etc.)
        doc.text(`Source du paiement : ${sourceProvider || sourceAccount}`);
        doc.moveDown(2);

        doc.rect(50, doc.y, 500, 50).fillAndStroke('#f8f9fa', '#dddddd');
        doc.fillColor('#28a745').font('Helvetica-Bold').fontSize(18).text(`MONTANT PAYÉ : ${amount} XOF`, 70, doc.y - 35);
        
        doc.end();

        stream.on('finish', async () => {
            console.log(`✅ Reçu PDF généré : ${filePath}`);
            res.status(200).json({ success: true, message: "Paiement validé", receipt: fileName });
        });

    } catch (error) {
        console.error("❌ Erreur paiement marchand :", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const axios = require('axios');

// --- CONFIGURATION PAYDUNYA (TEST) ---
const PAYDUNYA_MASTER_KEY = "EPUBEiOL-tK7m-sBbA-ftjg-mQen7xyw2ETp";
const PAYDUNYA_PRIVATE_KEY = "test_private_xZdMAGac4jWL85gCERLpfQQBsYz";
const PAYDUNYA_TOKEN = "8dG2vdIXN3k6qvONtgK7";

app.post('/api/paydunya/init', async (req, res) => {
    try {
        const { amount, description } = req.body;
        const response = await axios.post('https://app.paydunya.com/api/v1/checkout-invoice/create', {
            invoice: { total_amount: amount, description: description || "Paiement FAYALL" },
            store: { name: "FAYALL App" },
            custom_data: { userId: req.body.userId, transactionId: req.body.transactionId },
            actions: {
                cancel_url: "https://ais-dev-42ldjjdamaj4dayu53yxkx-101404280096.europe-west2.run.app/transfer",
                return_url: "https://ais-dev-42ldjjdamaj4dayu53yxkx-101404280096.europe-west2.run.app/transfer",
                callback_url: "https://fayall-backend.onrender.com/api/paydunya/ipn"
            }
        }, {
            headers: {
                'PAYDUNYA-MASTER-KEY': PAYDUNYA_MASTER_KEY,
                'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_PRIVATE_KEY,
                'PAYDUNYA-TOKEN': PAYDUNYA_TOKEN,
                'Content-Type': 'application/json'
            }
        });
        res.json({ success: true, paymentUrl: response.data.response_text, token: response.data.token });
    } catch (error) {
        res.status(500).json({ success: false, error: "Erreur PayDunya" });
    }
});

app.post('/api/paydunya/ipn', async (req, res) => {
    console.log("🔔 IPN PayDunya Reçu !");
    try {
        const data = req.body.data;
        if (!data || data.status !== "completed") return res.status(200).send("Ignoré");

        const { userId, transactionId } = data.custom_data;
        const amount = parseFloat(data.invoice.total_amount);

        const txnRef = db.collection('transactions').doc(transactionId); 
        const txnDoc = await txnRef.get();
        if (txnDoc.exists) return res.status(200).send("Déjà traité");

        const batch = db.batch();
        const userRef = db.collection('users').doc(userId);
        batch.update(userRef, { balance: admin.firestore.FieldValue.increment(amount) });
        batch.set(txnRef, {
            user_id: userId,
            type: 'DEPOSIT',
            amount: amount,
            currency: 'XOF',
            status: 'SUCCESS',
            source_provider: 'PAYDUNYA',
            source_account: 'MOBILE_MONEY',
            description: "Rechargement via PayDunya",
            reference: transactionId,
            created_at: new Date().toISOString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        res.status(200).send("OK");
    } catch (error) {
        res.status(500).send("Erreur interne");
    }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Serveur FAYALL démarré');
});
