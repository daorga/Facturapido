import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://wiquxjudclhbfhxqysry.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpcXV4anVkY2xoYmZoeHF5c3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MjM2ODksImV4cCI6MjA5MzQ5OTY4OX0.EPRDEg6wM6X19oEftJHCjHHT3PkGhopkoJlqQMeIK_U'
)
