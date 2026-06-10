import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Avatar d'un membre : affiche sa photo (User.image) si présente, sinon les
// initiales sur fond forêt. Réutilisé dans le header, la fiche membre, etc.
export function UserAvatar({
  image,
  firstName,
  lastName,
  className,
}: {
  image?: string | null;
  firstName: string;
  lastName: string;
  className?: string;
}) {
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <Avatar className={className}>
      {image ? (
        <AvatarImage
          src={image}
          alt={`${firstName} ${lastName}`}
          className="object-cover"
        />
      ) : null}
      <AvatarFallback className="bg-forest font-bold text-snow">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
