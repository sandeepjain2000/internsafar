import {

  Bell,

  Bookmark,

  Briefcase,

  Building2,

  ClipboardList,

  FileSearch,

  FolderOpen,

  Gavel,

  Inbox,

  LayoutList,

  MessageSquare,

  Package,

  ScrollText,

  Settings2,

  ShieldCheck,

  UserRound,

  Users,

} from 'lucide-react';



export const ROLE_MENUS = {

  student: [

    { label: 'Profile', href: '/student/profile', icon: UserRound },

    { label: 'Browse Internships', href: '/student/internships', icon: Briefcase },

    { label: 'Saved', href: '/student/saved', icon: Bookmark },

    { label: 'Job alerts', href: '/student/alerts', icon: Bell },

    { label: 'My Applications', href: '/student/applications', icon: ClipboardList },

    { label: 'My Participation', href: '/student/participation', icon: FolderOpen },

    { label: 'Messages', href: '/student/messages', icon: MessageSquare },

    { label: 'Raise grievance', href: '/student/cases/new', icon: Gavel },

    { label: 'Notifications', href: '/student/notifications', icon: Inbox },

    { label: 'Preferences', href: '/student/preferences', icon: Settings2 },

  ],

  employer: [

    { label: 'Company Profile', href: '/employer/company', icon: Building2 },

    { label: 'Team Users', href: '/employer/users', icon: Users },

    { label: 'Internships', href: '/employer/internships', icon: LayoutList },

    { label: 'Plans', href: '/employer/plans', icon: Package },

    { label: 'Messages', href: '/employer/messages', icon: MessageSquare },

    { label: 'Participation', href: '/employer/participation', icon: ClipboardList },

    { label: 'Notifications', href: '/employer/notifications', icon: Inbox },

    { label: 'Preferences', href: '/employer/preferences', icon: Settings2 },

  ],

  admin: [

    { label: 'Employer Verification', href: '/admin/verification', icon: ShieldCheck },

    { label: 'Listing oversight', href: '/admin/moderation', icon: FileSearch },

    { label: 'Cases / Grievances', href: '/admin/cases', icon: Gavel },

    { label: 'Notifications', href: '/admin/notifications', icon: Inbox },

    { label: 'Audit Log', href: '/admin/audit', icon: ScrollText },

    { label: 'Preferences', href: '/admin/preferences', icon: Settings2 },

  ],

};


