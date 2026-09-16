import {
  // Development & Web
  Code,
  Braces,
  FileCode,
  Terminal,
  GitBranch,
  Webhook,
  Globe,
  Laptop,
  Bug,
  // Cloud, Systems & Hardware
  Cpu,
  Cloud,
  Server,
  HardDrive,
  Boxes,
  Network,
  CircuitBoard,
  // AI, Data & Analytics
  Bot,
  Brain,
  Sparkles,
  Database,
  BarChart3,
  PieChart,
  TrendingUp,
  Table,
  // Mobile & Devices
  Smartphone,
  Tablet,
  Monitor,
  // Security & Auth
  Shield,
  Lock,
  Key,
  Fingerprint,
  // Design & Creative
  Layout,
  Palette,
  Paintbrush,
  PenTool,
  // Business, Agile & Product
  Kanban,
  Target,
  Rocket,
  Briefcase,
  DollarSign,
  Compass,
  // Education & Knowledge
  BookOpen,
  GraduationCap,
  Award,
  Lightbulb,
  type LucideIcon,
  VectorSquare,
} from "lucide-react";

export interface IllustrationPreset {
  id: string;
  title: string;
  icon: LucideIcon;
  tags: string[];
}

export const ILLUSTRATION_PRESETS: IllustrationPreset[] = [
  // Web & Software Engineering
  {
    id: "code",
    title: "Web & Code",
    icon: Code,
    tags: ["frontend", "react", "javascript", "html", "css", "programming"],
  },
  {
    id: "braces",
    title: "Algorithms & Logic",
    icon: Braces,
    tags: ["json", "backend", "data structures", "c++", "java"],
  },
  {
    id: "file_code",
    title: "Scripting & Files",
    icon: FileCode,
    tags: ["python", "script", "node", "file", "code"],
  },
  {
    id: "terminal",
    title: "CLI & Shell",
    icon: Terminal,
    tags: ["bash", "linux", "command line", "shell", "terminal"],
  },
  {
    id: "git",
    title: "Git & Version Control",
    icon: GitBranch,
    tags: ["git", "github", "version control", "commits", "branch"],
  },
  {
    id: "webhook",
    title: "APIs & Microservices",
    icon: Webhook,
    tags: ["api", "rest", "graphql", "integration", "webhooks"],
  },
  {
    id: "globe",
    title: "Web Development",
    icon: Globe,
    tags: ["web", "internet", "http", "domain", "networking"],
  },
  {
    id: "laptop",
    title: "Software Development",
    icon: Laptop,
    tags: ["coding", "computer", "developer", "software"],
  },
  {
    id: "bug_fix",
    title: "Testing & QA",
    icon: Bug,
    tags: ["testing", "jest", "debugging", "qa", "errors"],
  },

  // Cloud, DevOps & Infrastructure
  {
    id: "cpu",
    title: "Hardware & Architecture",
    icon: Cpu,
    tags: ["cpu", "processor", "embedded", "architecture", "hardware"],
  },
  {
    id: "cloud",
    title: "Cloud Computing",
    icon: Cloud,
    tags: ["aws", "azure", "cloud", "devops", "serverless"],
  },
  {
    id: "server",
    title: "Server Backend",
    icon: Server,
    tags: ["backend", "database", "infrastructure", "hosting"],
  },
  {
    id: "hard_drive",
    title: "Storage & Memory",
    icon: HardDrive,
    tags: ["storage", "disk", "backup", "memory"],
  },
  {
    id: "containers",
    title: "Docker & Kubernetes",
    icon: Boxes,
    tags: ["docker", "kubernetes", "containers", "devops"],
  },
  {
    id: "network",
    title: "Networking",
    icon: Network,
    tags: ["network", "ip", "tcp", "topology", "mesh"],
  },
  {
    id: "circuit",
    title: "IoT & Systems",
    icon: CircuitBoard,
    tags: ["iot", "hardware", "electronics", "raspberry pi", "arduino"],
  },

  // AI, Machine Learning & Data Science
  {
    id: "ai",
    title: "AI & Bots",
    icon: Bot,
    tags: ["ai", "bot", "chatgpt", "llm", "automation"],
  },
  {
    id: "brain",
    title: "Machine Learning",
    icon: Brain,
    tags: ["deep learning", "neural networks", "data science", "ai", "ml"],
  },
  {
    id: "sparkles",
    title: "Generative AI",
    icon: Sparkles,
    tags: ["prompting", "genai", "magic", "smart", "automation"],
  },
  {
    id: "database",
    title: "Databases & SQL",
    icon: Database,
    tags: ["sql", "postgres", "mongodb", "firebase", "data"],
  },
  {
    id: "analytics",
    title: "Data Analytics",
    icon: BarChart3,
    tags: ["metrics", "bi", "powerbi", "tableau", "charts"],
  },
  {
    id: "pie_chart",
    title: "Data Visualization",
    icon: PieChart,
    tags: ["reports", "stats", "analytics", "charts"],
  },
  {
    id: "trends",
    title: "Predictive Analytics",
    icon: TrendingUp,
    tags: ["finance", "forecasting", "growth", "trends"],
  },
  {
    id: "data_table",
    title: "Data Structures",
    icon: Table,
    tags: ["excel", "sheets", "tables", "rows", "columns"],
  },

  // Mobile & Hardware
  {
    id: "mobile",
    title: "Mobile Development",
    icon: Smartphone,
    tags: ["react native", "android", "ios", "flutter", "mobile"],
  },
  {
    id: "tablet",
    title: "Tablet Applications",
    icon: Tablet,
    tags: ["ipad", "tablet", "touch", "ui"],
  },
  {
    id: "monitor",
    title: "Desktop Software",
    icon: Monitor,
    tags: ["electron", "desktop", "display", "screen"],
  },

  // Security, Auth & Privacy
  {
    id: "security",
    title: "Cybersecurity",
    icon: Shield,
    tags: ["security", "hacking", "defence", "cyber", "protection"],
  },
  {
    id: "lock",
    title: "Authentication",
    icon: Lock,
    tags: ["auth", "jwt", "oauth", "passwords", "encryption"],
  },
  {
    id: "key",
    title: "API Keys & Secrets",
    icon: Key,
    tags: ["keys", "cryptography", "access", "vault"],
  },
  {
    id: "fingerprint",
    title: "Biometrics & Identity",
    icon: Fingerprint,
    tags: ["identity", "biometrics", "security", "mfa"],
  },

  // UI/UX Design & Creative
  {
    id: "design",
    title: "UI/UX Design",
    icon: Layout,
    tags: ["figma", "design", "wireframe", "ui", "ux"],
  },
  {
    id: "palette",
    title: "Graphic Design",
    icon: Palette,
    tags: ["colors", "css", "art", "design", "branding"],
  },
  {
    id: "paintbrush",
    title: "Styling & Theming",
    icon: Paintbrush,
    tags: ["tailwind", "sass", "css", "design", "themes"],
  },
  {
    id: "pentool",
    title: "Vector Design",
    icon: PenTool,
    tags: ["svg", "illustrator", "graphics", "pen"],
  },
  {
    id: "vector",
    title: "Digital Assets",
    icon: VectorSquare,
    tags: ["icons", "shapes", "vectors", "graphics"],
  },

  // Business, Agile & Product Management
  {
    id: "agile",
    title: "Agile & Scrum",
    icon: Kanban,
    tags: ["scrum", "jira", "agile", "sprints", "management"],
  },
  {
    id: "target",
    title: "Product Strategy",
    icon: Target,
    tags: ["okrs", "kpis", "goals", "strategy", "product"],
  },
  {
    id: "rocket",
    title: "Startup & Launch",
    icon: Rocket,
    tags: ["launch", "startup", "deployment", "product"],
  },
  {
    id: "briefcase",
    title: "Business & Career",
    icon: Briefcase,
    tags: ["career", "jobs", "enterprise", "business"],
  },
  {
    id: "finance",
    title: "FinTech & Money",
    icon: DollarSign,
    tags: ["crypto", "banking", "fintech", "accounting"],
  },
  {
    id: "compass",
    title: "Architecture & Direction",
    icon: Compass,
    tags: ["roadmap", "guidance", "architecture", "strategy"],
  },

  // General Learning & Certificates
  {
    id: "education",
    title: "Foundations & Theory",
    icon: BookOpen,
    tags: ["basics", "reading", "theory", "foundations"],
  },
  {
    id: "degree",
    title: "Qualifications",
    icon: GraduationCap,
    tags: ["qcto", "saqa", "degree", "diploma", "accredited"],
  },
  {
    id: "award",
    title: "Certifications",
    icon: Award,
    tags: ["certificate", "badge", "achievement", "mastery"],
  },
  {
    id: "idea",
    title: "Problem Solving",
    icon: Lightbulb,
    tags: ["creativity", "logic", "innovation", "ideas"],
  },
];
