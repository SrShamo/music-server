const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const YouTube = require('youtube-sr').default;

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURACIÓN SUPABASE
const supabase = createClient('https://lnjanjvnwjccfstmmtuo.supabase.co', 'sb_secret_7LpsFc69GTqOeQP-mfxivw_96rPlBSL');

// BUSCAR
app.get('/search', async (req, res) => {
    const query = req.query.q;
    console.log(">>> Buscando:", query);
    try {
        const videos = await YouTube.search(query, { limit: 10, type: 'video' });
        const results = videos.map(v => ({
            title: v.title,
            thumbnail: v.thumbnail ? v.thumbnail.url : "",
            channel: v.channel ? v.channel.name : "YouTube Artist",
            url: v.url
        }));
        res.json(results);
    } catch (err) {
        console.error("Error búsqueda:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// DESCARGAR Y SUBIR
app.post('/download', async (req, res) => {
    const { title, artist, image, url } = req.body; // <-- 'url' es vital
    const uniqueId = Date.now();
    const outputFile = path.join(__dirname, `temp_${uniqueId}.mp3`);

    console.log(">>> Descargando:", title);

    try {
        // Usamos la URL directa que viene del search
        const videoUrl = url || `ytsearch1:"${title} ${artist}"`;
        
        // El comando corregido (asegúrate de que ffmpeg esté en /usr/bin/ffmpeg)
        const command = `yt-dlp -x --audio-format mp3 --ffmpeg-location /usr/bin/ffmpeg -o "${outputFile}" "${videoUrl}"`;

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.error("Error yt-dlp:", error.message);
                return res.status(500).json({ error: error.message });
            }

            try {
                if (!fs.existsSync(outputFile)) throw new Error("El archivo MP3 no se generó.");

                const fileBuffer = fs.readFileSync(outputFile);
                const finalName = `music_${uniqueId}.mp3`;

                console.log(">>> Subiendo a Supabase...");
                const { error: uploadError } = await supabase.storage
                    .from('Musics') // <-- Revisa que el bucket se llame exactamente 'Musics'
                    .upload(`scraped/${finalName}`, fileBuffer, { 
                        contentType: 'audio/mpeg',
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('Musics').getPublicUrl(`scraped/${finalName}`);

                console.log(">>> Guardando en DB...");
                const { error: dbError } = await supabase.from('songs').insert([{
                    title, 
                    artist, 
                    image_url: image, 
                    audio_url: urlData.publicUrl
                }]);

                if (dbError) throw dbError;

                // Limpieza
                fs.unlinkSync(outputFile);
                console.log(">>> ¡Éxito total!");
                res.json({ success: true, url: urlData.publicUrl });

            } catch (err) {
                if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
                console.error("Error proceso:", err.message);
                res.status(500).json({ error: err.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('>>> Servidor 24/7 en puerto 3000'));
