import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create service role client for admin operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const demoEmail = 'demo@didinow.com';
    const demoPassword = 'Demo#123456';
    const demoPhone = '+987654321';

    console.log('Creating demo user...');

    // First, try to create the user in auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      phone: demoPhone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: {
        full_name: 'Demo User',
      },
    });

    // If user already exists, get their data
    let userId: string;
    if (authError && authError.message.includes('already been registered')) {
      console.log('Demo user already exists, fetching...');
      const { data: existingUser, error: fetchError } = await supabaseAdmin
        .from('auth.users')
        .select('id')
        .eq('email', demoEmail)
        .single();
      
      if (fetchError) {
        // Try to get user by email using auth admin
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;
        
        const existingUserAuth = users.users.find(u => u.email === demoEmail);
        if (!existingUserAuth) throw new Error('Failed to find existing demo user');
        userId = existingUserAuth.id;
      } else {
        userId = existingUser.id;
      }
    } else if (authError) {
      throw authError;
    } else {
      userId = authData.user.id;
    }

    console.log('Demo user ID:', userId);

    // Now upsert the profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        full_name: 'Demo User',
        phone: demoPhone,
        community: 'demo-community',
        flat_no: '9999',
        is_admin: false,
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error('Profile upsert error:', profileError);
      throw profileError;
    }

    console.log('Demo user seeded successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Demo user seeded successfully',
        userId: userId
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error seeding demo user:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to seed demo user',
        details: error
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});