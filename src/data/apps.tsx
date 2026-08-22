/**
 * Application registry.
 *
 * Adding a new "program" to the desktop means adding one entry here — the
 * desktop grid, the Start menu and the window renderer all read from this list.
 */

import type { ReactNode } from "react";
import {
  AboutIcon,
  ActivitiesIcon,
  ComputerIcon,
  ContactIcon,
  DisplayIcon,
  EducationIcon,
  UploadIcon,
  ExperienceIcon,
  LanguageIcon,
  ProjectsIcon,
  ResumeIcon,
  SkillsIcon,
} from "../components/Icons";
import { AdminWindow } from "../components/content/AdminWindow";
import {
  AboutWindow,
  ActivitiesWindow,
  ContactWindow,
  EducationWindow,
  ExperienceWindow,
  PersonalInfoWindow,
  PortfolioWindow,
  ProjectsWindow,
  ResumeWindow,
  SettingsWindow,
  SkillsWindow,
} from "../components/content/CvSections";
import type { UiKey } from "../i18n/strings";

export interface AppDef {
  id: string;
  /** Key into the UI strings table — gives us the localized window title. */
  titleKey: UiKey;
  icon: (props: { className?: string }) => ReactNode;
  render: () => ReactNode;
  /** Preferred window size on first open. */
  size: { width: number; height: number };
  /** Whether the app gets an icon on the desktop (settings lives in Start only). */
  onDesktop: boolean;
}

export const APPS: AppDef[] = [
  {
    id: "personal-info",
    titleKey: "personalInfo",
    icon: ComputerIcon,
    render: () => <PersonalInfoWindow />,
    size: { width: 520, height: 380 },
    onDesktop: true,
  },
  {
    id: "about",
    titleKey: "about",
    icon: AboutIcon,
    render: () => <AboutWindow />,
    size: { width: 600, height: 420 },
    onDesktop: true,
  },
  {
    id: "education",
    titleKey: "education",
    icon: EducationIcon,
    render: () => <EducationWindow />,
    size: { width: 640, height: 460 },
    onDesktop: true,
  },
  {
    id: "skills",
    titleKey: "skills",
    icon: SkillsIcon,
    render: () => <SkillsWindow />,
    size: { width: 620, height: 440 },
    onDesktop: true,
  },
  {
    id: "experience",
    titleKey: "experience",
    icon: ExperienceIcon,
    render: () => <ExperienceWindow />,
    size: { width: 680, height: 480 },
    onDesktop: true,
  },
  {
    id: "projects",
    titleKey: "projects",
    icon: ProjectsIcon,
    render: () => <ProjectsWindow />,
    size: { width: 720, height: 500 },
    onDesktop: true,
  },
  {
    id: "activities",
    titleKey: "activities",
    icon: ActivitiesIcon,
    render: () => <ActivitiesWindow />,
    size: { width: 560, height: 320 },
    onDesktop: true,
  },
  {
    id: "portfolio",
    titleKey: "portfolio",
    icon: LanguageIcon,
    render: () => <PortfolioWindow />,
    size: { width: 480, height: 280 },
    onDesktop: true,
  },
  {
    id: "contact",
    titleKey: "contact",
    icon: ContactIcon,
    render: () => <ContactWindow />,
    size: { width: 580, height: 320 },
    onDesktop: true,
  },
  {
    id: "resume",
    titleKey: "resume",
    icon: ResumeIcon,
    render: () => <ResumeWindow />,
    size: { width: 460, height: 260 },
    onDesktop: true,
  },
  {
    id: "admin",
    titleKey: "admin",
    icon: UploadIcon,
    render: () => <AdminWindow />,
    size: { width: 560, height: 520 },
    onDesktop: true,
  },
  {
    id: "settings",
    titleKey: "settings",
    icon: DisplayIcon,
    render: () => <SettingsWindow />,
    size: { width: 560, height: 400 },
    onDesktop: false,
  },
];

export const APP_BY_ID = new Map(APPS.map((app) => [app.id, app]));
