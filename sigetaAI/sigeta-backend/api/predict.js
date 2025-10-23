import tf from '@tensorflow/tfjs';

// Global state untuk menyimpan data terbaru
let latestData = {
  gas_level: 0,
  temperature: 0,
  humidity: 0,
  status: "Menunggu data pertama...",
  time: new Date().toLocaleString('id-ID'),
  spray_active: false,
  prediction: 0,
  confidence: 0
};

// Training data untuk AI model
const trainingData = {
  features: [
    [150, 25, 60], [200, 26, 65], [300, 27, 70], [250, 28, 55],
    [180, 24, 58], [220, 25, 62], [280, 26, 68], [190, 27, 63],
    [500, 28, 72], [450, 29, 75], [600, 30, 78], [550, 31, 80],
    [800, 30, 80], [900, 31, 85], [1000, 32, 90], [1200, 33, 95],
    [750, 29, 82], [850, 30, 88], [950, 31, 92], [1100, 32, 94]
  ],
  labels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]
};

let model;

// Initialize AI model
async function initializeModel() {
  try {
    model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [3], units: 10, activation: 'relu' }),
        tf.layers.dense({ units: 5, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });

    model.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    const xs = tf.tensor2d(trainingData.features);
    const ys = tf.tensor1d(trainingData.labels);

    await model.fit(xs, ys, {
      epochs: 100,
      batchSize: 4,
      validationSplit: 0.2,
      verbose: 0
    });

    console.log('✅ AI Model trained successfully');
    
    xs.dispose();
    ys.dispose();
    
  } catch (error) {
    console.error('❌ Model training failed:', error);
  }
}

// Prediction function
async function predictOdor(mq, temp, humidity) {
  if (!model) {
    await initializeModel();
  }

  try {
    const input = tf.tensor2d([[mq, temp, humidity]]);
    const prediction = model.predict(input);
    const confidence = (await prediction.data())[0];
    
    input.dispose();
    prediction.dispose();
    
    return {
      prediction: confidence > 0.5 ? 1 : 0,
      confidence: Math.round(confidence * 100) / 100
    };
  } catch (error) {
    console.error('Prediction error:', error);
    // Fallback rule-based
    if (mq > 700) return { prediction: 1, confidence: 0.95 };
    if (mq > 400) return { prediction: 0, confidence: 0.85 };
    return { prediction: 0, confidence: 0.90 };
  }
}

// Initialize model on startup
initializeModel();

export default async function handler(req, res) {
  // Set CORS headers - PENTING untuk izinkan frontend
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Handle POST request (dari ESP32)
    if (req.method === 'POST') {
      const { mq, temperature, humidity } = req.body;
      
      console.log(`📥 Data from ESP32: MQ=${mq}, Temp=${temperature}, Hum=${humidity}`);
      
      // Validate input
      if (mq === undefined || temperature === undefined || humidity === undefined) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Data sensor tidak lengkap' 
        });
      }

      // AI Prediction
      const aiResult = await predictOdor(
        parseFloat(mq), 
        parseFloat(temperature), 
        parseFloat(humidity)
      );

      // Determine status and action
      let status, spray_active;
      if (aiResult.prediction === 1) {
        status = "⚠️ BAU TINGGI - PENYEMPROTAN AKTIF";
        spray_active = true;
      } else {
        if (mq > 400) {
          status = "⚠️ BAU RINGAN";
        } else {
          status = "✅ BERSIH";
        }
        spray_active = false;
      }

      // Update latest data
      latestData = {
        gas_level: parseFloat(mq),
        temperature: parseFloat(temperature),
        humidity: parseFloat(humidity),
        status,
        time: new Date().toLocaleString('id-ID'),
        spray_active,
        prediction: aiResult.prediction,
        confidence: aiResult.confidence
      };

      console.log(`🎯 AI Result: ${status}, Confidence: ${aiResult.confidence}`);

      // Response untuk ESP32
      return res.json({
        status: 'success',
        message: spray_active ? 'BAU TERDETEKSI' : 'AMAN',
        prediction: aiResult.prediction,
        spray_active,
        confidence: aiResult.confidence,
        timestamp: latestData.time
      });
    }

    // Handle GET request (untuk web dashboard)
    if (req.method === 'GET') {
      return res.json(latestData);
    }

    return res.status(405).json({ error: 'Method tidak diizinkan' });

  } catch (error) {
    console.error('❌ API Error:', error);
    return res.status(500).json({ 
      status: 'error', 
      message: 'Error internal server',
      error: error.message 
    });
  }
}