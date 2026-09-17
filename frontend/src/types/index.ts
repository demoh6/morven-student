import { LucideIcon } from "lucide-react";

export type Theme = 'light' | 'dark' | 'system';

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  lastUsed?: number;
  comingSoon?: boolean;
}

export type ToolCategory =
  | 'pdf'
  | 'powerpoint'
  | 'video'
  | 'audio'
  | 'images'
  | 'qrcode'
  | 'general'
  | 'medical'
  | 'engineering';

export interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer | string;
  createdAt: number;
  toolUsed?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  taskType?: 'normal' | 'daily';
  dailyTime?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExamCountdown {
  id: string;
  name: string;
  date: string;
  color: string;
  createdAt: number;
}

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MedicalNote {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  deck: string;
  type?: 'general' | 'medical';
  difficulty: 'easy' | 'medium' | 'hard';
  nextReview: number;
  reviewCount: number;
  createdAt: number;
}

export interface PersistentFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
  createdAt: number;
  toolUsed?: string;
}