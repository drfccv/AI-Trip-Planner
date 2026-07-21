export type DesktopRequest = { path: string; method?: "GET"|"POST"|"PUT"|"PATCH"|"DELETE"; body?: unknown };
export type DesktopResponse = { status: number; data?: any };
export interface DesktopClient { request(input: DesktopRequest): Promise<DesktopResponse>; exportBackup(): Promise<{cancelled:boolean;path?:string}>; importBackup(): Promise<{cancelled:boolean;path?:string}>; openDataDirectory(): Promise<void>; about(): Promise<{version:string;license:string}>; }
