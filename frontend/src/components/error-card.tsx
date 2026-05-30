interface ErrorCardProps {
  title?: string;
  message: string;
  variant?: "section" | "page";
}

export function ErrorCard({
  title = "Something went wrong",
  message,
  variant = "section",
}: ErrorCardProps) {
  const classes =
    variant === "page" ? "error-card error-card-page" : "error-card";
  return (
    <div className={classes} role="alert">
      <h3 className="error-card-title">{title}</h3>
      <p className="error-card-message">{message}</p>
    </div>
  );
}
