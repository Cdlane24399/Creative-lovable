
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

// Load env vars from .env.local
const envConfig = dotenv.parse(fs.readFileSync('.env.local'))
for (const k in envConfig) {
    process.env[k] = envConfig[k]
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

async function checkLatestProject() {
    console.log('Checking latest project...')
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error) {
        console.error('Error fetching project:', error)
        return
    }

    console.log('Project:', data.name, 'ID:', data.id)
    if (data.files_snapshot) {
        const files = Object.keys(data.files_snapshot)
        console.log('Files snapshot keys count:', files.length)
        console.log('Files:', files.slice(0, 5))
    } else {
        console.log('Files snapshot is null or undefined')
    }
}

checkLatestProject()
