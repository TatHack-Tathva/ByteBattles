import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ghost } from "./ui";

const link = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 py-1 transition-colors hover:text-amber-400 ${isActive ? "border-amber-400 text-amber-400" : "border-transparent"}`;

export default function Navbar() {
  const { signOut, user, isAdmin } = useAuth();
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur sm:px-6">
      <Link to="/" className="text-lg font-extrabold tracking-tight">
        Byte<span className="text-amber-400">Battles</span>
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm">
        <NavLink to="/" end className={link}>Problems</NavLink>
        {isAdmin && <NavLink to="/admin" className={link}>Admin</NavLink>}
        <NavLink to="/status" className={link}>Status</NavLink>
        {user && <span className="hidden text-slate-400 sm:inline">{user.username}</span>}
        <button onClick={signOut} className={ghost}>Log out</button>
      </nav>
    </header>
  );
}
