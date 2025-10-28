export default function Contact() {
  return (
    <article className="contact">
  <h2>📬 Jon Hoffman Photography – Contact Us</h2>

      <section>
        <h3>🏢 Business Address</h3>
        <address>
          <div>Jon Hoffman Photography</div>
          <div>1596 Patriots Point SE</div>
          <div>Canton, OH 44709</div>
        </address>

      </section>

      <section>
  <h3>📞 Work Phone</h3>
  <p>Main Line: <a href="tel:+13304131735">(330) 413-1735</a></p>
      </section>

      <section>
        <h3>📧 Customer Support</h3>
        <ul>
          <li>Email: <a href="mailto:JonHoffmanBusiness@Gmail.com">JonHoffmanBusiness@Gmail.com</a></li>
          <li>Business Inquiries: <a href="mailto:JonHoffmanBusiness@Gmail.com">JonHoffmanBusiness@Gmail.com</a></li>
        </ul>
      </section>

      {/* Meet the Team section removed */}

      <section>
        <h3>📣 Social Media</h3>
        <p>Follow us for updates and new work:</p>
        <ul>
          <li>Instagram: <a href="#/" rel="noopener noreferrer">@JonHoffmanPhotography</a></li>
          <li>TikTok: <a href="#/" rel="noopener noreferrer">@JonnyShotts</a></li>
          <li>Threads: <a href="#/" rel="noopener noreferrer">@JonHoffmanPhotography</a> <span style={{ opacity: 0.85 }}>(I almost exclusively post about baseball here)</span></li>
        </ul>
      </section>
    </article>
  )
}
