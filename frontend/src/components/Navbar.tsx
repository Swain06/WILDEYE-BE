import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  PawPrint,
  Map,
  Flame,
  Shield,
  Home,
  Moon,
  Sun,
  Menu,
  X,
  Globe2,
  BarChart2,
  Newspaper,
  LayoutGrid,
  Satellite,
  Wind,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/', icon: Home },
  { name: 'Wildlife', path: '/wildlife', icon: PawPrint },
  { name: 'Habitat', path: '/habitat', icon: Map },
  { name: 'Fire', path: '/fire', icon: Flame },
  { name: 'Poaching', path: '/poaching', icon: Shield },
  { name: 'Map View', path: '/map', icon: Globe2 },
  { name: 'Analytics', path: '/analytics', icon: BarChart2 },
  { name: 'Satellite', path: '/satellite', icon: Satellite },
  { name: 'Carbon', path: '/carbon', icon: Wind },
  { name: 'News', path: '/news', icon: Newspaper },
];

export function Navbar() {
  const [isDark, setIsDark] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark', !isDark);
    localStorage.setItem('theme', !isDark ? 'dark' : 'light');
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b glass">
      <div className="container mx-auto px-6">
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 transition-transform hover:scale-105 active:scale-95">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary animate-pulse-slow">
              <PawPrint className="h-6 w-6" />
            </div>
            <span className="text-2xl font-black tracking-tight text-gradient">WildEye</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'relative h-10 gap-2 px-4 font-semibold transition-all duration-300',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    )}
                  >
                    <item.icon className={cn('h-4 w-4 transition-transform duration-300', isActive && 'scale-110')} />
                    {item.name}
                    {isActive && (
                      <span className="absolute -bottom-[21px] left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-primary animate-fade-in" />
                    )}
                  </Button>
                </Link>
              );
            })}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              className="h-10 w-10 rounded-xl border-border/50 transition-all hover:bg-secondary hover:text-primary active:scale-95"
            >
              {isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden rounded-xl h-10 w-10"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden py-6 border-t animate-slide-up">
            <div className="flex flex-col gap-3">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Button
                    variant={location.pathname === item.path ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-4 h-12 px-4 rounded-xl font-medium transition-all',
                      location.pathname === item.path && 'bg-primary/10 text-primary border border-primary/20'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
