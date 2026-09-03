/*
  # Create schema for Ariana Legal Assistant

  1. New Tables
    - `conversations` - ذخیره مکالمات کاربران
    - `messages` - ذخیره پیام‌های مکالمه
    - `uploaded_files` - ذخیره فایل‌های آپلود شده
    - `analysis_results` - ذخیره نتایج تحلیل‌های Claude
    - `legal_references` - ذخیره منابع حقوقی برای reference

  2. Security
    - Enable RLS on all tables
    - Add policies for data access control
*/

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT 'بدون عنوان',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  analysis_results jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read messages in own conversations"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in own conversations"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Uploaded files table
CREATE TABLE IF NOT EXISTS uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  file_url text NOT NULL,
  file_content text,
  upload_order integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read files in own conversations"
  ON uploaded_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = uploaded_files.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload files to own conversations"
  ON uploaded_files FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Analysis results table
CREATE TABLE IF NOT EXISTS analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  prompt_number integer NOT NULL CHECK (prompt_number BETWEEN 1 AND 3),
  analysis_text text NOT NULL,
  tokens_used integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read analysis results"
  ON analysis_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages
      JOIN conversations ON conversations.id = messages.conversation_id
      WHERE messages.id = analysis_results.message_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Legal references table (for knowledge base)
CREATE TABLE IF NOT EXISTS legal_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL,
  reference_type text,
  law_code text,
  article_number text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE legal_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read legal references"
  ON legal_references FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_conversation_id ON uploaded_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_message_id ON analysis_results(message_id);
