create policy "Users can delete own emails" on raw_emails for delete using (auth.uid() = user_id);
