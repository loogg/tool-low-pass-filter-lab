export default function SectionIntro({ eyebrow, title, description, aside }) {
  return (
    <div className="section-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="section-description">{description}</p>
      </div>
      {aside ? <div className="section-aside">{aside}</div> : null}
    </div>
  )
}
