const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// CONFIGURACIÓN SUPABASE
const supabaseUrl = 'https://lnjanjvnwjccfstmmtuo.supabase.co';
const supabaseKey = 'sb_publishable_dpkjAjSKx1cgxczcjSbSAw_Arib-u0G'; 
const _supabase = createClient(supabaseUrl, supabaseKey);

console.log(">>> SISTEMA INICIADO EN PUERTO:", PORT);

app.get('/', (req, res) => res.send("Servidor Activo 🚀"));

// BUSCAR
app.get('/search', (req, res) => {
    const query = req.query.q;
    console.log(">>> PETICIÓN DE BÚSQUEDA:", query);
    
    const command = `./yt-dlp "ytsearch5:${query}" --dump-json --no-playlist --flat-playlist`;
    
    exec(command, (error, stdout) => {
        if (error) {
            console.error(">>> ERROR EN BÚSQUEDA:", error.message);
            return res.status(500).json({ error: error.message });
        }
        const results = stdout.trim().split('\n').map(line => JSON.parse(line));
        console.log(">>> BÚSQUEDA EXITOSA");
        res.json(results);
    });
});

// DESCARGAR
app.post('/download', async (req, res) => {
    const { title, artist, image } = req.body;
    console.log(">>> INICIANDO DESCARGA PARA:", title);

    const videoUrl = `ytsearch1:"${title} ${artist}"`;
    const fileName = `${Date.now()}.mp3`;
    const outputFile = path.join('/tmp', fileName);

    // Intentamos descargar directo (Render suele tener ffmpeg en el sistema por defecto)
    const command = `./yt-dlp -x --audio-format mp3 -o "${outputFile}" ${videoUrl}`;

    exec(command, async (error) => {
        if (error) {
            console.error(">>> ERROR DESCARGANDO:", error.message);
            return res.status(500).json({ error: error.message });
        }

        try {
            console.log(">>> LEYENDO ARCHIVO DE /tmp...");
            const fileBuffer = fs.readFileSync(outputFile);

            console.log(">>> SUBIENDO A SUPABASE STORAGE...");
            const { error: uploadError } = await _supabase.storage
                .from('songs')
                .upload(`audios/${fileName}`, fileBuffer, { contentType: 'audio/mpeg' });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = _supabase.storage.from('songs').getPublicUrl(`audios/${fileName}`);

            console.log(">>> GUARDANDO EN BASE DE DATOS...");
            const { error: dbError } = await _supabase.from('songs').insert([
                { title, artist, image_url: image, audio_url: publicUrl }
            ]);

            if (dbError) throw dbError;

            fs.unlinkSync(outputFile);
            console.log(">>> ¡TODO COMPLETADO CON ÉXITO!");
            res.json({ success: true, url: publicUrl });

        } catch (err) {
            console.error(">>> ERROR EN PROCESO POST-DESCARGA:", err.message);
            res.status(500).json({ error: err.message });
        }
    });
});

app.listen(PORT, () => {
    console.log(`>>> ESCUCHANDO EN PUERTO ${PORT}`);
});
