const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
// Render asigna el puerto automáticamente, por eso usamos process.env.PORT
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const supabaseUrl = 'https://lnjanjvnwjccfstmmtuo.supabase.co';
const supabaseKey = 'sb_publishable_dpkjAjSKx1cgxczcjSbSAw_Arib-u0G'; // Usa tu Service Role Key si da error de permisos
const _supabase = createClient(supabaseUrl, supabaseKey);

// RUTA DE BÚSQUEDA
app.get('/search', (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).send('Falta la búsqueda');

    // En Linux usamos yt-dlp a secas
const command = `./yt-dlp "ytsearch5:${query}" --get-title --get-id --get-thumbnail --print "%(uploader)s" --j`;
    
    exec(command, (error, stdout) => {
        if (error) return res.status(500).json({ error: error.message });
        
        const lines = stdout.trim().split('\n');
        const results = lines.map(line => {
            const data = JSON.parse(line);
            return {
                title: data.title,
                id: data.id,
                thumbnail: data.thumbnail,
                channel: data.uploader,
                url: `https://www.youtube.com/watch?v=${data.id}`
            };
        });
        res.json(results);
    });
});

// RUTA DE DESCARGA Y SUBIDA
app.post('/download', async (req, res) => {
    const { title, artist, image } = req.body;
    const videoUrl = `ytsearch1:"${title} ${artist}"`;
    const fileName = `${Date.now()}.mp3`;
    const outputFile = path.join('/tmp', fileName); // En Render escribimos en /tmp

    // Comando para Linux (sin .exe)
const command = `./yt-dlp -x --audio-format mp3 -o "${outputFile}" ${videoUrl}`;

    exec(command, async (error) => {
        if (error) return res.status(500).json({ error: error.message });

        const fileBuffer = fs.readFileSync(outputFile);

        // Subir a Supabase Storage
        const { data, error: uploadError } = await _supabase.storage
            .from('songs')
            .upload(`audios/${fileName}`, fileBuffer, { contentType: 'audio/mpeg' });

        if (uploadError) return res.status(500).json({ error: uploadError.message });

        const { data: { publicUrl } } = _supabase.storage.from('songs').getPublicUrl(`audios/${fileName}`);

        // Guardar en la tabla de la base de datos
        const { error: dbError } = await _supabase.from('songs').insert([
            { title, artist, image_url: image, audio_url: publicUrl }
        ]);

        fs.unlinkSync(outputFile); // Borrar archivo temporal

        if (dbError) return res.status(500).json({ error: dbError.message });
        res.json({ success: true, url: publicUrl });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
