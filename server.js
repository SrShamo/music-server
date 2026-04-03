const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const ytdl = require('@distube/ytdl-core');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// CONFIGURACIÓN SUPABASE
const supabaseUrl = 'https://lnjanjvnwjccfstmmtuo.supabase.co';
const supabaseKey = 'sb_publishable_dpkjAjSKx1cgxczcjSbSAw_Arib-u0G'; 
const _supabase = createClient(supabaseUrl, supabaseKey);

console.log(">>> SERVIDOR DE MÚSICA INICIADO EN PUERTO:", PORT);

// RUTA DE PRUEBA
app.get('/', (req, res) => res.send("Servidor de José en la Nube 🚀"));

// BUSCAR CANCIONES (Usamos yt-dlp para buscar porque es más rápido)
app.get('/search', (req, res) => {
    const query = req.query.q;
    console.log(">>> BUSCANDO EN YOUTUBE:", query);
    
    const command = `./yt-dlp "ytsearch5:${query}" --dump-json --no-playlist --flat-playlist`;
    
    exec(command, (error, stdout) => {
        if (error) {
            console.error(">>> ERROR BÚSQUEDA:", error.message);
            return res.status(500).json({ error: error.message });
        }
        try {
            const results = stdout.trim().split('\n').map(line => {
                const data = JSON.parse(line);
                return {
                    title: data.title,
                    id: data.id,
                    thumbnail: data.thumbnails ? data.thumbnails[0].url : '',
                    channel: data.uploader || data.channel,
                    url: `https://www.youtube.com/watch?v=${data.id}`
                };
            });
            res.json(results);
        } catch (e) {
            res.status(500).json({ error: "Error procesando JSON de búsqueda" });
        }
    });
});

// DESCARGAR Y SUBIR (Usamos ytdl-core para saltar el bloqueo de bots)
app.post('/download', async (req, res) => {
    const { title, artist, image, url } = req.body;
    
    if (!url) return res.status(400).json({ error: "Falta la URL del video" });

    console.log(">>> INICIANDO PROCESO PARA:", title);

    const fileName = `${Date.now()}.mp3`;
    const outputFile = path.join('/tmp', fileName);

    try {
        // Configuramos la descarga simulando un cliente de Android para evitar bloqueos
        const stream = ytdl(url, { 
            filter: 'audioonly', 
            quality: 'highestaudio',
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Android 11; Mobile; rv:94.0) Gecko/94.0 Firefox/94.0'
                }
            }
        });

        const fileStream = fs.createWriteStream(outputFile);
        stream.pipe(fileStream);

        fileStream.on('finish', async () => {
            console.log(">>> DESCARGA EXITOSA. LEYENDO ARCHIVO...");
            
            try {
                const fileBuffer = fs.readFileSync(outputFile);

                console.log(">>> SUBIENDO A SUPABASE STORAGE...");
                const { error: uploadError } = await _supabase.storage
                    .from('songs')
                    .upload(`audios/${fileName}`, fileBuffer, { 
                        contentType: 'audio/mpeg',
                        upsert: true 
                    });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = _supabase.storage.from('songs').getPublicUrl(`audios/${fileName}`);

                console.log(">>> REGISTRANDO EN BASE DE DATOS...");
                const { error: dbError } = await _supabase.from('songs').insert([
                    { 
                        title: title, 
                        artist: artist, 
                        image_url: image, 
                        audio_url: publicUrl 
                    }
                ]);

                if (dbError) throw dbError;

                // Limpiar archivo temporal
                if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
                
                console.log(">>> ¡TODO LISTO! CANCIÓN DISPONIBLE EN LA APP.");
                res.json({ success: true, url: publicUrl });

            } catch (innerError) {
                console.error(">>> ERROR EN SUBIDA:", innerError.message);
                res.status(500).json({ error: innerError.message });
            }
        });

        fileStream.on('error', (err) => {
            console.error(">>> ERROR ESCRIBIENDO ARCHIVO:", err.message);
            res.status(500).json({ error: err.message });
        });

    } catch (err) {
        console.error(">>> ERROR CRÍTICO YTDL:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`>>> SERVIDOR ESCUCHANDO EN EL PUERTO ${PORT}`);
});
