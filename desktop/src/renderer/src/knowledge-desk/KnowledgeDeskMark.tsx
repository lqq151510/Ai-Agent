type KnowledgeDeskMarkProps = {
  className?: string;
  title?: string;
};

export const KnowledgeDeskMark = ({ className, title }: KnowledgeDeskMarkProps) => (
  <svg
    aria-hidden={title ? undefined : true}
    aria-label={title}
    className={className}
    fill="none"
    role={title ? 'img' : undefined}
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
  >
    {title ? <title>{title}</title> : null}
    <rect fill="#151716" height="44" rx="13" width="44" x="2" y="2" />
    <path d="M12 14.5L17.1 9.5H34.2L38 13.3V20.5H17.4L12 25.8V14.5Z" fill="#F4F1E8" />
    <path d="M12 24.2L17.2 19H35.8L40 23.2V30.2H17.6L12 35.8V24.2Z" fill="#E9E6DE" />
    <path d="M12 33.6L17.6 28H36.2L40 31.8V38.5H17.8L12 44.2V33.6Z" fill="#F4F1E8" />
    <path d="M17.5 33H35.2V36.8H17.5V33Z" fill="#DFFF33" />
    <circle cx="35.7" cy="40" fill="#FF5A36" r="2.15" />
  </svg>
);
