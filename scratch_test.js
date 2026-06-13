const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.bak', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[0].split('=')[0].trim();
    let value = match[0].split('=').slice(1).join('=').trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log("Searching for Christian Martin Nicolas Amaya...");
  
  const { data: monos, error: mErr } = await supabase
    .from('monotributistas')
    .select('*')
    .ilike('apellido_nombre', '%amaya%');
    
  if (mErr) console.error("Error monotributista:", mErr);
  console.log("Monotributistas found:", monos);

  if (monos && monos.length > 0) {
    const personId = monos[0].id;
    
    const { data: docs, error: dErr } = await supabase
      .from('documentos')
      .select('*')
      .eq('persona_id', personId);
      
    if (dErr) console.error("Error docs:", dErr);
    console.log("Documents found:", docs);

    const { data: deliveries, error: delErr } = await supabase
      .from('campana_entregas')
      .select('*')
      .eq('persona_id', personId);
      
    if (delErr) console.error("Error deliveries:", delErr);
    console.log("Deliveries found:", deliveries);
    
    const { data: campaigns } = await supabase
      .from('campanas_documentacion')
      .select('*');
    console.log("Campaigns:", campaigns);
  }
}

run();
