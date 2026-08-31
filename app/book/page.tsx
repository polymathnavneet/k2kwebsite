import { BookForm } from "@/components/book-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function BookPage(){
  return <main>
    <SiteHeader />
    <section className="book-hero">
      <div>
        <div className="section-tag light">THE BOOK FROM THE ROAD</div>
        <h1>A Long<br />Walk.</h1>
        <p>A country crossed at walking speed—through field notes, strangers, weather, mistakes, photographs and the conversations normal travel misses.</p>
        <a href="#register">Get one update when the book is ready ↓</a>
      </div>
      <div className="book-cover"><small>NAVNEET</small><strong>A<br />LONG<br />WALK</strong><span>A BOOK FROM THE ROAD</span></div>
    </section>
    <section className="book-promises">
      <article><b>01</b><h2>Written while moving</h2><p>Daily notes preserve the small things before memory tidies them up.</p></article>
      <article><b>02</b><h2>Built from people</h2><p>The road matters, but the human encounters are the real record.</p></article>
      <article><b>03</b><h2>No payment</h2><p>Leave one contact and the site will tell you when the book is ready.</p></article>
    </section>
    <section className="book-quote"><div className="section-tag">A WORKING PROMISE</div><blockquote>“India is not the distance between two points. It is everything that happens because I walked between them.”</blockquote></section>
    <section id="register" className="book-register">
      <div><div className="section-tag">BOOK UPDATES</div><h2>Tell me once.</h2><p>Name and one way to reach you. No account, preferences, format survey or pile of boxes.</p></div>
      <BookForm />
    </section>
    <SiteFooter />
  </main>;
}
