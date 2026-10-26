# Deploying the Stead site to Hostinger hPanel

1. **Create the subdomain.** hPanel → Domains → Subdomains → create `stead` under `dataharmoni.com`. Note the document root it creates (usually `public_html/stead`).
2. **Fill in the blanks first.**
   - `content/article.md`: replace the two `[ESTIMATE: ...]` placeholders, then regenerate `article/index.html` (and update `syndication/article-medium-substack.md` the same way).
   - `contact/send.php`: set the real address (replace `CHANGE_ME@example.com`, or set the `STEAD_CONTACT_TO` env var). Check PHP is 8.1 or newer under hPanel → Advanced → PHP Configuration.
   - Add a `LICENSE` (Apache-2.0) to the repo, then you may add the license line back to the article and site.
3. **Upload** (File Manager or FTP) into the subdomain's document root: `index.html`, `article/`, `contact/`, `assets/`, `.htaccess`.
   Do **not** upload `content/`, `syndication/`, `PRODUCT.md`, `DESIGN.md`, `DEPLOY.md` or `.impeccable/` (the `.htaccess` blocks them if you do).
4. **Turn on SSL** for the subdomain (hPanel → Security → SSL), then check `https://stead.dataharmoni.com/`.
5. **Test the form.** Send a message from the contact page and confirm it arrives. If it does not, check the From address in `send.php` (`noreply@dataharmoni.com`): Hostinger often drops mail from addresses not on the account's domain. Create that mailbox or change it to one that exists.
6. **Publish the article** on Medium and Substack from `syndication/article-medium-substack.md`; upload the two PNGs from `syndication/` and set the canonical link to `https://stead.dataharmoni.com/article/` (Medium: Story settings → Advanced → Customize canonical link; Substack: import/SEO settings).
