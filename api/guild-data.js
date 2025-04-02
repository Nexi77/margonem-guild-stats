import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://akbiubtqvjhpjhgnmnss.supabase.co',
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('guild_data')
      .select('json')
      .eq('id', 'current')
      .single();

    if (error) throw error;
    res.status(200).json(data.json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve guild data' });
  }
}
