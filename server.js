const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin'); // NOUVEAU : Firebase Admin

// NOUVEAU : Initialisation de Firebase
const serviceAccount = require('./firebase-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
app.use(express.json());
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Bypass-Tunnel-Reminder', 'Authorization']
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

// --- LA ROUTE D'ENVOI ---
app.post('/upload-kyc', upload.fields([
  { name: 'recto', maxCount: 1 },
  { name: 'verso', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]), (req, res) => {
  console.log("--- NOUVELLE REQUÊTE KYC ---");
  console.log("ID Utilisateur :", req.body.userId);
  
  // Vérifions si multer a bien trouvé les fichiers
  if (!req.files || Object.keys(req.files).length === 0) {
      console.log("❌ AUCUN FICHIER REÇU ! Multer n'a rien trouvé.");
      return res.status(400).send('Aucun fichier reçu');
  }

  console.log("✅ Fichiers reçus :");
  if (req.files['recto']) console.log("- Recto sauvegardé");
  if (req.files['verso']) console.log("- Verso sauvegardé");
  if (req.files['selfie']) console.log("- Selfie sauvegardé");
  
  res.status(200).send('OK');
});

// Route pour valider un utilisateur dans Firebase
app.post('/valider-kyc/:userId', async (req, res) => {
    const userId = req.params.userId;
    console.log(`⏳ Début de la validation pour l'utilisateur : ${userId}`);
    
    try {
        // Met à jour le statut dans Firebase
        await db.collection('users').doc(userId).update({
            kyc_status: 'VERIFIED',
            cni_number: 'SN-' + Math.floor(Math.random() * 1000000000)
        });
        console.log(`✅ Utilisateur ${userId} validé avec succès dans Firebase !`);
        res.status(200).send("Utilisateur validé !");
    } catch (error) {
        console.error("❌ Erreur CRITIQUE lors de la validation Firebase :", error);
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
                    // Si l'ID est inconnu, on le demande manuellement
                    if (userId === 'inconnu') {
                        userId = prompt("Veuillez entrer l'ID Firebase de l'utilisateur à valider (ex: beqrs2xdCTZaKJMc516ZMYv30ij1) :");
                        if (!userId) return; // Annulé
                    }

                    btn.innerText = "Validation en cours...";
                    fetch('http://localhost:3000/valider-kyc/' + userId, { method: 'POST' })
                    .then(response => {
                        if(response.ok) {
                            btn.innerText = "✅ VALIDÉ (" + userId + ")";
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

        // On regroupe simplement par ID (même si c'est 'inconnu')
        const users = {};
        
        files.forEach(file => {
            if (!file.startsWith('.')) {
                const userId = file.split('-')[0]; // L'ID est avant le premier tiret
                if (userId) {
                    if (!users[userId]) users[userId] = [];
                    users[userId].push(file);
                }
            }
        });

        const userIds = Object.keys(users);

        if (userIds.length === 0) {
            html += "<p>Aucun document reçu. Le dossier uploads est vide.</p>";
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

// --- NOUVEAU : MOTEUR DE PAIEMENT MARCHAND ET GÉNÉRATION DE REÇU PDF ---
const PDFDocument = require('pdfkit');

app.post('/pay-merchant', async (req, res) => {
    console.log("--- 🛒 NOUVEAU PAIEMENT MARCHAND ---");
    const { userId, merchantId, amount, sourceAccount, transactionId } = req.body;
    
    console.log(`💸 Paiement de ${amount} XOF vers le marchand [${merchantId}] par l'utilisateur [${userId}]`);
    console.log(`🏦 Source des fonds : ${sourceAccount}`);

    try {
        // 1. Créer le dossier des reçus s'il n'existe pas
        const receiptsDir = path.join(__dirname, 'receipts');
        if (!fs.existsSync(receiptsDir)) {
            fs.mkdirSync(receiptsDir);
        }

        // 2. Générer le reçu PDF
        const fileName = `Recu_FAYALL_${transactionId}.pdf`;
        const filePath = path.join(receiptsDir, fileName);
        
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // En-tête du reçu
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#1a73e8').text('FAYALL', { align: 'center' });
        doc.fontSize(14).fillColor('#555555').text('REÇU DE PAIEMENT MARCHAND', { align: 'center' });
        doc.moveDown(2);
        
        // Détails de la transaction
        doc.fontSize(12).fillColor('black').font('Helvetica');
        doc.text(`ID Transaction : ${transactionId}`);
        doc.text(`Date : ${new Date().toLocaleString('fr-FR')}`);
        doc.moveDown();
        
        // Détails du Marchand
        doc.font('Helvetica-Bold').text('Détails du Marchand :');
        doc.font('Helvetica').text(`ID Marchand : ${merchantId}`);
        doc.moveDown();

        // Détails du Client
        doc.font('Helvetica-Bold').text('Détails du Client :');
        doc.font('Helvetica').text(`ID Client : ${userId}`);
        doc.text(`Source du paiement : ${sourceAccount}`);
        doc.moveDown(2);

        // Montant (dans un cadre gris)
        doc.rect(50, doc.y, 500, 50).fillAndStroke('#f8f9fa', '#dddddd');
        doc.fillColor('#28a745').font('Helvetica-Bold').fontSize(18).text(`MONTANT PAYÉ : ${amount} XOF`, 70, doc.y - 35);
        
        doc.end();

        // Attendre que le fichier soit bien écrit sur le disque
        stream.on('finish', async () => {
            console.log(`✅ Reçu PDF généré avec succès : ${filePath}`);
            
            // 3. (Optionnel) Ici, on pourrait mettre à jour le solde du marchand dans Firestore
            // Pour l'instant, on simule juste la création de la table merchants
            /*
            await db.collection('merchants').doc(merchantId).set({
                balance: admin.firestore.FieldValue.increment(amount),
                lastTransaction: new Date()
            }, { merge: true });
            */

            res.status(200).json({ success: true, message: "Paiement validé et reçu généré", receipt: fileName });
        });

    } catch (error) {
        console.error("❌ Erreur lors du paiement marchand :", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const axios = require('axios');

// --- CONFIGURATION PAYDUNYA (TEST) ---
// Remplace ces valeurs par les clés de TEST de ton compte PayDunya
const PAYDUNYA_MASTER_KEY = "EPUBEiOL-tK7m-sBbA-ftjg-mQen7xyw2ETp";
const PAYDUNYA_PRIVATE_KEY = "test_private_xZdMAGac4jWL85gCERLpfQQBsYz";
const PAYDUNYA_TOKEN = "8dG2vdIXN3k6qvONtgK7";

// 1. Route pour INITIER un paiement (React appellera cette route)
app.post('/api/paydunya/init', async (req, res) => {
    try {
        const { amount, description, customerName, customerEmail, customerPhone } = req.body;

        const response = await axios.post('https://app.paydunya.com/api/v1/checkout-invoice/create', {
            invoice: {
                total_amount: amount,
                description: description || "Paiement FAYALL"
            },
            store: {
                name: "FAYALL App"
            },
            custom_data: {
                // On garde l'ID de l'utilisateur ou de la transaction pour s'en souvenir quand PayDunya nous répondra
                userId: req.body.userId,
                transactionId: req.body.transactionId
            },
            actions: {
                // L'URL où le client est redirigé après succès/échec (on met l'URL de ton app React)
                cancel_url: "https://ais-dev-42ldjjdamaj4dayu53yxkx-101404280096.europe-west2.run.app/transfer",
                return_url: "https://ais-dev-42ldjjdamaj4dayu53yxkx-101404280096.europe-west2.run.app/transfer",
                // C'est ICI que PayDunya envoie la confirmation invisible en arrière-plan
                // REMPLACE L'ANCIENNE URL PAR LA NOUVELLE :
                callback_url: "https://lulmz-2001-4278-1f-5837-243f-c5f2-7f9f-f579.a.free.pinggy.link/api/paydunya/ipn"
            }
        }, {
            headers: {
                'PAYDUNYA-MASTER-KEY': PAYDUNYA_MASTER_KEY,
                'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_PRIVATE_KEY,
                'PAYDUNYA-TOKEN': PAYDUNYA_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        // PayDunya nous renvoie un lien de paiement (token_url)
        res.json({
            success: true,
            paymentUrl: response.data.response_text, // C'est l'URL où l'utilisateur doit aller pour payer
            token: response.data.token
        });

    } catch (error) {
        console.error("Erreur PayDunya Init:", error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, error: "Erreur lors de l'initialisation du paiement" });
    }
});

// 2. Route IPN (Callback) : PayDunya appelle cette route quand le paiement est terminé
app.post('/api/paydunya/ipn', (req, res) => {
    console.log("🔔 IPN PayDunya Reçu !");
    console.log("Données reçues :", req.body);

    const status = req.body.data.status;
    const customData = req.body.data.custom_data;

    if (status === "completed") {
        console.log(`✅ Paiement RÉUSSI pour la transaction ${customData.transactionId}`);
        // ICI : Tu mettras à jour Firebase pour dire que l'argent est bien arrivé
    } else {
        console.log(`❌ Paiement ÉCHOUÉ ou ANNULÉ pour la transaction ${customData.transactionId}`);
    }

    // Il faut TOUJOURS répondre 200 OK à PayDunya pour qu'ils sachent qu'on a bien reçu le message
    res.status(200).send("OK");
});

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Serveur FAYALL démarré sur le port 3000');
  console.log('📁 Galerie Admin disponible sur : http://localhost:3000/admin');
});
