import { useState, useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { Settings, Search, PlusCircle, User, Zap, Folder, CheckSquare, MessageSquare, ChevronDown, Mic, ArrowUp, Monitor, FileText, PanelRight, X, ChevronRight, ThumbsUp, ThumbsDown, CornerUpLeft, Share, LayoutGrid as LayoutGridIcon, Check as CheckIcon, Pin, Trash2, RefreshCw, TerminalSquare, Filter as FilterIcon, Hand, ShieldAlert, CircleAlert, Plus, Paperclip, Hexagon, Waypoints, Target, Wand2, Minus, GitBranch, Globe, ArrowLeft, ArrowRight, ExternalLink, MoreVertical, Maximize2, MoreHorizontal, Copy, PlusSquare, GitCommit, Columns, UploadCloud, Bot, Archive } from 'lucide-react';

declare global {
  interface Window {
    electronAPI: any;
  }
}

export const ChatLayout = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
  const [currentView, setCurrentView] = useState<'chat' | 'plugins' | 'automation'>('chat');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [showReasoningDropdown, setShowReasoningDropdown] = useState(false);
  const [showPlusDropdown, setShowPlusDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showNewProjectSubmenu, setShowNewProjectSubmenu] = useState(false);
  const [hoveredChat, setHoveredChat] = useState<{id: string, rect: DOMRect, title: string, time: string, branch: string} | null>(null);

  const [contextMode, setContextMode] = useState('完全访问权限');
  const [reasoningLevel, setReasoningLevel] = useState('低');
  
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showMicPopover, setShowMicPopover] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<'env' | 'menu' | 'review' | 'browser' | 'files' | 'sidechat' | 'gitdiff'>('env');
  const [pluginTab, setPluginTab] = useState<'plugins' | 'skills'>('plugins');
  const [showCommitPopup, setShowCommitPopup] = useState(false);
  
  // Right panel resize state
  const [rightPanelWidth, setRightPanelWidth] = useState<number | null>(null);
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Backend States
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<any>(null);
  const [gitBranches, setGitBranches] = useState<any[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [gitStatusFiles, setGitStatusFiles] = useState<{file: string, status: string}[]>([]);
  const [gitDiffContent, setGitDiffContent] = useState<string>('');

  // Codex UI States
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null);
  const [activePromptLineIdx, setActivePromptLineIdx] = useState<number | null>(null);
  const [inlinePromptText, setInlinePromptText] = useState('');
  const [inlinePromptLoading, setInlinePromptLoading] = useState(false);
  const [inlineReviews, setInlineReviews] = useState<Record<number, string>>({});
  const [isDeepReviewing, setIsDeepReviewing] = useState(false);
  
  // Advanced Architecture UI States
  const [showSubAgentsPanel, setShowSubAgentsPanel] = useState(true);
  
  // Initialize mock messages for demonstration
  useEffect(() => {
    setMessages([
      {
        id: '1',
        role: 'user',
        content: '帮我安装 react-router-dom 并配置路由。',
        timestamp: '10:00 AM'
      },
      {
        id: '2',
        role: 'assistant',
        type: 'memory_retrieval',
        content: '检索到 3 条历史经验和 2 个相关代码块...',
        timestamp: '10:00 AM'
      },
      {
        id: '3',
        role: 'assistant',
        type: 'sandbox_approval',
        command: 'npm install react-router-dom',
        reason: '需要执行终端命令来安装你请求的依赖。',
        timestamp: '10:01 AM',
        status: 'pending' // pending, approved, rejected
      }
    ]);
  }, []);
  useEffect(() => {
    const loadInitialData = async () => {
      if (window.electronAPI) {
        // Load Workspaces
        const wksps = await window.electronAPI.workspace.getAll();
        setWorkspaces(wksps);
        const activeWkspPath = await window.electronAPI.workspace.getActive();
        if (activeWkspPath) {
          const wksp = wksps.find((w: any) => w.path === activeWkspPath);
          setActiveWorkspace(wksp || { path: activeWkspPath, name: activeWkspPath.split('/').pop() });
          
          // Load Git Branches
          const branches = await window.electronAPI.git.getBranches(activeWkspPath);
          setGitBranches(branches);
          const current = branches.find((b: any) => b.isCurrent);
          if (current) setCurrentBranch(current.name);
        }

        // Load Chats
        const sessions = await window.electronAPI.chat.getSessions();
        setChatSessions(sessions);
      }
    };
    loadInitialData();
  }, []);

  // Fetch real Git data when switching to review or gitdiff tab
  useEffect(() => {
    const fetchGitData = async () => {
      if (!window.electronAPI || !activeWorkspace?.path) return;
      if (activeRightTab === 'review' || activeRightTab === 'gitdiff' || activeRightTab === 'env') {
        try {
          const files = await window.electronAPI.git.getStatus(activeWorkspace.path);
          setGitStatusFiles(files || []);
          const diff = await window.electronAPI.git.getDiff(activeWorkspace.path);
          setGitDiffContent(diff || '');
        } catch (e) {
          console.error('Failed to fetch git data', e);
        }
      }
    };
    fetchGitData();
  }, [activeRightTab, activeWorkspace]);

  // Resize Right Panel Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRightPanel) return;
      const newWidth = document.body.clientWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setRightPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizingRightPanel(false);
    };
    if (isResizingRightPanel) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingRightPanel]);

  // Reset width when changing tabs
  useEffect(() => {
    setRightPanelWidth(null);
  }, [activeRightTab]);

  // Handle New Chat
  const handleNewChat = async () => {
    setCurrentView('chat');
    if (window.electronAPI) {
      const newSession = await window.electronAPI.chat.createSession(currentBranch);
      setActiveSessionId(newSession.id);
      setMessages([]);
      setInputText('');
      
      // Reload sessions to update sidebar
      const sessions = await window.electronAPI.chat.getSessions();
      setChatSessions(sessions);
    } else {
      setMessages([]);
      setInputText('');
    }
  };

  // Handle Load Chat
  const handleLoadChat = async (id: string) => {
    setCurrentView('chat');
    setActiveSessionId(id);
    if (window.electronAPI) {
      const session = await window.electronAPI.chat.getSession(id);
      if (session) {
        setMessages(session.messages);
        setCurrentBranch(session.branch);
      }
    }
  };

  // Send message
  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const userMsg = { role: 'user', time: '0s', content: inputText };
    setMessages([...messages, { id: Date.now(), ...userMsg }]);
    setInputText('');

    if (window.electronAPI) {
      let sId = activeSessionId;
      if (!sId) {
        const newSession = await window.electronAPI.chat.createSession(currentBranch);
        sId = newSession.id;
        setActiveSessionId(sId);
      }

      // Append message
      await window.electronAPI.chat.appendMessage(sId, userMsg);
      
      // If it's the first message, summarize title
      if (messages.length === 0) {
         await window.electronAPI.chat.summarizeTitle(sId, userMsg.content);
      }
      
      // Mock agent response
      setTimeout(async () => {
        const agentMsg: any = { role: 'agent', time: '1s', content: '我明白了，我已经将内容记录下来。' };
        if (inputText.includes('搜索')) {
          agentMsg.content = '我已经确认仓库里确实有 desktop/ 和 ts-cli/，而且当前还有一批未提交的后端与前端改动。下一步我会先读这几个骨架的 README 和入口配置，判断它们现在是“真骨架”还是“占位壳”，再给你定迁移边界。';
          agentMsg.sources = [
            { title: 'desktop/ 和 ts-cli/', type: 'web', url: '#' },
            { title: '后端与前端改动', type: 'web', url: '#' }
          ];
        }
        setMessages(prev => [...prev, { id: Date.now(), ...agentMsg }]);
        if (sId) await window.electronAPI.chat.appendMessage(sId, agentMsg);
        
        // Reload sessions to update sidebar titles
        const sessions = await window.electronAPI.chat.getSessions();
        setChatSessions(sessions);
      }, 1000);
    } else {
      setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), role: 'agent', time: '1s', content: '我明白了，我已经将内容记录下来。' }]);
      }, 1000);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[#1a1a1a] font-sans">
      
      {/* Left Sidebar */}
      <div className="w-[260px] bg-[#f9f9f9] border-r border-[#e5e5e5] flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
          </div>
          <div className="flex gap-2 ml-4 text-[#888]">
            <ArrowUp className="rotate-[-90deg]" size={14} />
            <ArrowUp className="rotate-90" size={14} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          <SidebarItem icon={PlusCircle} label="新对话" onClick={handleNewChat} />
          <SidebarItem icon={Search} label="搜索" />
          <SidebarItem icon={LayoutGridIcon} label="插件" active={currentView === 'plugins'} onClick={() => setCurrentView('plugins')} />
          
          <SidebarSection title="自动化" />
          <div className="px-3 py-1.5 flex justify-between items-center text-[13px] text-[#555] hover:bg-[#ebebeb] rounded-lg cursor-pointer">
            <span>安装QT</span>
            <span className="text-[#888] text-[12px]">2 天</span>
          </div>

          <SidebarSection title="项目" onAdd={() => {
            // Handle add project (mock)
            console.log("Add project clicked");
          }} />
          {workspaces.map((w, idx) => (
             <SidebarItem key={idx} icon={Folder} label={w.name} onClick={() => {
                if (window.electronAPI) {
                  window.electronAPI.workspace.setActive(w.path);
                  setActiveWorkspace(w);
                  window.electronAPI.git.getBranches(w.path).then(setGitBranches);
                }
             }} onArchive={(e) => {
                e.stopPropagation();
                console.log("Archive project clicked", w.name);
             }}/>
          ))}

          <div className="px-3 pt-2 pb-1 flex items-center justify-between group cursor-pointer text-[#333]">
            <div className="flex items-center gap-1 text-[13px] font-medium">
              <Folder size={16} className="text-[#888]" /> {activeWorkspace?.name || '当前项目'}
            </div>
            <Plus size={14} className="text-[#888] hover:text-black hidden group-hover:block" onClick={(e) => { e.stopPropagation(); console.log("Add session to current project"); handleNewChat(); }} />
          </div>
          <div className="pl-6 space-y-0.5">
            {chatSessions.filter(s => s.branch === currentBranch).map((session) => (
              <div 
                key={session.id}
                onClick={() => handleLoadChat(session.id)}
                className={`px-3 py-1.5 flex justify-between items-center text-[12px] ${activeSessionId === session.id ? 'bg-[#e3e3e3] text-[#333]' : 'text-[#555] hover:bg-[#ebebeb]'} rounded-md cursor-pointer group`}
                onMouseEnter={(e) => setHoveredChat({ 
                  id: session.id, 
                  rect: e.currentTarget.getBoundingClientRect(), 
                  title: session.title, 
                  time: new Date(session.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
                  branch: session.branch 
                })}
                onMouseLeave={() => setHoveredChat(null)}
              >
                <span className="truncate w-[100px] font-medium">{session.title}</span>
                <span className="text-[#888] text-[11px] scale-90 group-hover:hidden">...</span>
                <div className="hidden group-hover:flex items-center gap-1.5 text-[#888]">
                  <Pin size={14} className="hover:text-black" />
                  <Archive size={14} className="hover:text-black" onClick={(e) => { e.stopPropagation(); console.log("Archive session", session.id); }} />
                  <Trash2 size={14} className="hover:text-black hover:text-red-500" onClick={(e) => { e.stopPropagation(); console.log("Delete session", session.id); }} />
                </div>
              </div>
            ))}
          </div>

          <SidebarSection title="对话" onAdd={handleNewChat} />
          {chatSessions.filter(s => s.branch !== currentBranch).map((session) => (
            <div 
              key={session.id}
              onClick={() => handleLoadChat(session.id)}
              className={`px-3 py-1.5 flex justify-between items-center text-[12px] ${activeSessionId === session.id ? 'bg-[#e3e3e3] text-[#333]' : 'text-[#555] hover:bg-[#ebebeb]'} rounded-lg cursor-pointer group`}
            >
              <span className="truncate w-[120px]">{session.title}</span>
              <span className="text-[#888] text-[11px] group-hover:hidden">...</span>
              <div className="hidden group-hover:flex items-center gap-1.5 text-[#888]">
                 <Archive size={14} className="hover:text-black" onClick={(e) => { e.stopPropagation(); console.log("Archive session", session.id); }} />
              </div>
            </div>
          ))}
        </div>

        {/* Profile / Settings Button */}
        <div className="p-2 border-t border-[#e5e5e5] relative">
          {showProfileMenu && (
            <div className="absolute bottom-full left-2 mb-2 w-[220px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg p-1 z-50">
              <div className="px-3 py-2 text-[12px] text-[#888] flex items-center gap-2">
                <User size={14} /> 3942713639@qq.com
              </div>
              <div className="h-[1px] bg-[#eee] my-1"></div>
              <MenuOption icon={User} label="个人资料" />
              <MenuOption icon={Settings} label="设置" shortcut="⌘," onClick={() => { setShowProfileMenu(false); onOpenSettings(); }} />
              <div className="h-[1px] bg-[#eee] my-1"></div>
              <MenuOption icon={Zap} label="剩余用量" hasArrow />
              <MenuOption icon={User} label="邀请好友" />
              <MenuOption icon={ArrowUp} className="rotate-90" label="退出登录" />
            </div>
          )}
          <div 
            className="flex items-center justify-between px-2 py-1.5 hover:bg-[#ebebeb] rounded-lg cursor-pointer text-[13px] text-[#555]"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <div className="flex items-center gap-2">
              <Settings size={16} />
              <span>设置</span>
            </div>
            <div className="w-5 h-5 flex items-center justify-center border border-[#ccc] rounded text-[10px]">⇧</div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {currentView === 'chat' && (
        <div className="flex-1 flex flex-col relative bg-white min-w-0" onClick={() => { setShowContextDropdown(false); setShowReasoningDropdown(false); setShowPlusDropdown(false); setShowBranchDropdown(false); setShowProjectDropdown(false); setShowMicPopover(false); }}>
          
          {/* Chat Header */}
          <div className="h-12 border-b border-[#e5e5e5] flex items-center justify-between px-4 shrink-0">
            <div className="text-[13px] font-medium text-[#333] flex items-center gap-2">
              架构大升级：全面转向客户端(Desktop)与命令...
              <span className="text-[#888]">...</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#f5f5f5] px-2 py-1 rounded-md border border-[#e5e5e5] text-[12px] cursor-pointer hover:bg-[#ebebeb]">
                 <span className="text-codex-blue font-bold">✓</span> <ChevronDown size={14} className="text-[#888]"/>
              </div>
              <Monitor size={16} className="text-[#888] cursor-pointer" />
              <PanelRight size={16} className="text-[#888] cursor-pointer" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center -mt-20">
                <h1 className="text-[32px] text-[#333] mb-8">我们应该在 AI-agent 中构建什么?</h1>
                <div className="w-full max-w-3xl relative">
                  
                  {/* Reasoning Dropdown */}
                  {showReasoningDropdown && (
                    <div className="absolute bottom-full right-8 mb-2 w-[180px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg p-2 z-50">
                      <div className="text-[12px] text-[#888] px-3 py-1 font-semibold">推理</div>
                      <div className="mt-1 space-y-0.5">
                        {['低', '中', '高', '超高'].map((level) => (
                          <div key={level} className="px-3 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer flex items-center justify-between text-[13px] text-[#333]" onClick={(e) => { e.stopPropagation(); setReasoningLevel(level); setShowReasoningDropdown(false); }}>
                            {level}
                            {reasoningLevel === level && <CheckIcon size={14} />}
                          </div>
                        ))}
                        <div className="h-[1px] bg-[#eee] my-1"></div>
                        <div className="px-3 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer flex items-center justify-between text-[13px] text-[#333]" onClick={(e) => { e.stopPropagation(); }}>
                          GPT-5.4-Mini <ChevronRight size={14} className="text-[#888]" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-[#f9f9f9] border border-[#e5e5e5] rounded-2xl p-1 focus-within:border-[#ccc] focus-within:bg-white focus-within:shadow-sm transition-all flex flex-col relative">
                    <input 
                      type="file" 
                      multiple 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={(e) => {
                        if (e.target.files) {
                          setSelectedFiles([...selectedFiles, ...Array.from(e.target.files)]);
                        }
                      }}
                    />
                    
                    {selectedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-3 pt-2">
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 bg-white border border-[#e5e5e5] rounded-md px-2 py-1 text-[12px] shadow-sm">
                            <span className="truncate max-w-[120px]">{file.name}</span>
                            <X size={12} className="cursor-pointer text-[#888] hover:text-black" onClick={() => setSelectedFiles(files => files.filter((_, i) => i !== idx))} />
                          </div>
                        ))}
                      </div>
                    )}

                    <textarea 
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      className="w-full min-h-[60px] max-h-[200px] p-3 text-[14px] bg-transparent outline-none resize-none placeholder-[#aaa]"
                      placeholder="随心输入"
                    />
                    
                    {/* Floating Info Pill / Mic Popover */}
                    {inputText && !showMicPopover && (
                       <div className="absolute top-2 right-3 border border-[#e5e5e5] bg-white rounded-lg px-2 py-1 flex items-center justify-center shadow-sm">
                          <div className="text-[11px] text-[#888] text-center leading-tight">
                            背景信息窗口:<br/>0% 已用 (剩余 100%)
                          </div>
                       </div>
                    )}
                    {showMicPopover && (
                       <div className="absolute -top-10 right-0 border border-[#e5e5e5] bg-white rounded-full px-3 py-1.5 flex items-center justify-center shadow-md z-50">
                          <div className="text-[12px] text-[#555] flex items-center gap-2">
                            点击进行听写或长按 <span className="bg-[#f5f5f5] border border-[#e5e5e5] px-1.5 py-0.5 rounded text-[10px] font-mono">^⇧D</span>
                          </div>
                       </div>
                    )}

                    <div className="flex items-center justify-between px-2 pb-1 pt-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1 hover:bg-[#ebebeb] rounded-md cursor-pointer relative" onClick={(e) => { e.stopPropagation(); setShowPlusDropdown(!showPlusDropdown); setShowContextDropdown(false); setShowReasoningDropdown(false); setShowMicPopover(false); }}>
                          <Plus size={18} className="text-[#888] hover:text-black" />
                          
                          {/* Plus Dropdown (Aligned to touch the button) */}
                          {showPlusDropdown && (
                            <div className="absolute bottom-full left-0 mb-1 w-[240px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg p-3 z-50 text-[14px] text-left cursor-auto" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-3 px-2 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer text-[#333]" onClick={() => { fileInputRef.current?.click(); setShowPlusDropdown(false); }}>
                                <Paperclip size={18} className="text-[#555]" /> <span className="font-medium text-[#333]">添加照片和文件</span>
                              </div>
                              <div className="flex items-center gap-3 px-2 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer text-[#333]">
                                <Hexagon size={18} className="text-codex-blue" /> <span className="font-medium text-[#333]">附加 Antigravity</span>
                              </div>
                              <div className="h-[1px] bg-[#eee] my-2"></div>
                              <div className="flex items-center justify-between px-2 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer text-[#333]">
                                <div className="flex items-center gap-3"><Waypoints size={18} className="text-[#555]" /> <span className="font-medium text-[#333]">计划模式</span></div>
                                <div className="w-9 h-5 bg-[#e0e0e0] rounded-full relative"><div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full shadow-sm"></div></div>
                              </div>
                              <div className="flex items-center justify-between px-2 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer text-[#333]">
                                <div className="flex items-center gap-3"><Target size={18} className="text-[#555]" /> <span className="font-medium text-[#333]">追求目标</span></div>
                                <div className="w-9 h-5 bg-[#e0e0e0] rounded-full relative"><div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full shadow-sm"></div></div>
                              </div>
                              <div className="h-[1px] bg-[#eee] my-2"></div>
                              <div className="flex items-center justify-between px-2 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer text-[#333]">
                                <div className="flex items-center gap-3"><Wand2 size={18} className="text-[#555]" /> <span className="font-medium text-[#333]">创建</span></div>
                                <ChevronRight size={16} className="text-[#888]" />
                              </div>
                              <div className="flex items-center justify-between px-2 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer text-[#333]">
                                <div className="flex items-center gap-3"><LayoutGridIcon size={18} className="text-[#555]" /> <span className="font-medium text-[#333]">插件</span></div>
                                <ChevronRight size={16} className="text-[#888]" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <div 
                            className="flex items-center gap-1.5 text-[14px] font-medium text-[#e04523] cursor-pointer hover:bg-[#fdebea] px-2 py-1 rounded-md"
                            onClick={(e) => { e.stopPropagation(); setShowContextDropdown(!showContextDropdown); setShowReasoningDropdown(false); setShowPlusDropdown(false); setShowMicPopover(false); }}
                          >
                            <CircleAlert size={16} />
                            {contextMode.replace('权限', '')} <ChevronDown size={14} />
                          </div>
                          
                          {showContextDropdown && (
                            <div className="absolute bottom-full left-0 mb-2 w-[340px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg p-3 z-50 text-left" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-between items-center px-1 mb-2">
                                <span className="text-[13px] text-[#888] font-medium">应如何批准 Codex 操作？</span>
                                <a href="#" className="text-[12px] text-[#888] hover:underline underline-offset-2">了解更多</a>
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="p-2.5 rounded-xl cursor-pointer flex items-start gap-3 hover:bg-[#f5f5f5]" onClick={() => { setContextMode('请求批准'); setShowContextDropdown(false); }}>
                                  <Hand size={20} className="mt-0.5 text-[#555]" />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[14px] text-[#333] font-medium">请求批准</span>
                                      {contextMode === '请求批准' && <CheckIcon size={16} className="text-[#333]" />}
                                    </div>
                                    <div className="text-[13px] text-[#888] mt-0.5">编辑外部文件和使用互联网时始终询问</div>
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-xl cursor-pointer flex items-start gap-3 hover:bg-[#f5f5f5]" onClick={() => { setContextMode('替我审批'); setShowContextDropdown(false); }}>
                                  <Bot size={20} className="mt-0.5 text-[#555]" />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[14px] text-[#333] font-medium">替我审批</span>
                                      {contextMode === '替我审批' && <CheckIcon size={16} className="text-[#333]" />}
                                    </div>
                                    <div className="text-[13px] text-[#888] mt-0.5">仅对检测到的风险操作请求批准</div>
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-xl cursor-pointer flex items-start gap-3 hover:bg-[#f5f5f5]" onClick={() => { setContextMode('完全访问权限'); setShowContextDropdown(false); }}>
                                  <CircleAlert size={20} className="mt-0.5 text-[#555]" />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[14px] text-[#333] font-medium">完全访问权限</span>
                                      {contextMode === '完全访问权限' && <CheckIcon size={16} className="text-[#333]" />}
                                    </div>
                                    <div className="text-[13px] text-[#888] mt-0.5">可不受限制地访问互联网和您电脑上的任何文件</div>
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-xl cursor-pointer flex items-start gap-3 hover:bg-[#f5f5f5]" onClick={() => { setContextMode('自定义'); setShowContextDropdown(false); }}>
                                  <Settings size={20} className="mt-0.5 text-[#555]" />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[14px] text-[#333] font-medium">自定义 (config.toml)</span>
                                      {contextMode === '自定义' && <CheckIcon size={16} className="text-[#333]" />}
                                    </div>
                                    <div className="text-[13px] text-[#888] mt-0.5">使用 config.toml 中定义的权限</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div 
                          className="flex items-center gap-1 text-[12px] text-[#555] cursor-pointer hover:bg-[#ebebeb] px-2 py-1 rounded-md"
                          onClick={(e) => { e.stopPropagation(); setShowReasoningDropdown(!showReasoningDropdown); setShowContextDropdown(false); setShowPlusDropdown(false); setShowMicPopover(false); }}
                        >
                          <div className="w-2 h-2 rounded-full border border-[#888] mr-0.5"></div> 5.4-Mini {reasoningLevel} <ChevronDown size={12} />
                        </div>
                        <div 
                          className="p-1 hover:bg-[#ebebeb] rounded-md cursor-pointer relative"
                          onMouseEnter={() => setShowMicPopover(true)}
                          onMouseLeave={() => setShowMicPopover(false)}
                        >
                          <Mic size={16} className="text-[#888] hover:text-black" />
                        </div>
                        <button 
                          onClick={handleSend}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${inputText.trim() ? 'bg-black text-white' : 'bg-[#e5e5e5] text-[#888]'}`}
                        >
                          <ArrowUp size={14} className={inputText.trim() ? "text-white" : "text-[#aaa]"} />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Context Pills Below Input */}
                  <div className="flex items-center gap-4 mt-3 ml-2 relative">
                     <div 
                      className="flex items-center gap-1.5 text-[12px] text-[#888] cursor-pointer hover:text-[#555] relative"
                      onClick={(e) => { e.stopPropagation(); setShowProjectDropdown(!showProjectDropdown); setShowBranchDropdown(false); }}
                    >
                       <Monitor size={14} /> AI-agent <ChevronDown size={12} />
                       
                       {/* Context Aware Pill */}
                       {(activeRightTab === 'gitdiff' || activeRightTab === 'review') && gitStatusFiles.length > 0 && (
                         <div className="ml-2 flex items-center gap-1 px-1.5 py-0.5 bg-[#f0f0f0] text-[#555] rounded border border-[#e5e5e5] hover:bg-[#e8e8e8] transition-colors" title="AI将自动读取此变更上下文">
                           <Paperclip size={12} className="text-[#a074f3]" /> 关联当前 {gitStatusFiles.length} 个变更文件
                         </div>
                       )}
                       
                       {/* Project Dropdown */}
                       {showProjectDropdown && (
                          <div className="absolute top-full left-0 mt-2 w-[220px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg z-50 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="p-2 border-b border-[#eee]">
                              <div className="relative">
                                <Search size={12} className="absolute left-2 top-2 text-[#aaa]" />
                                <input type="text" placeholder="搜索项目" className="w-full bg-[#f5f5f5] rounded-md py-1.5 pl-6 pr-2 text-[12px] outline-none" />
                              </div>
                            </div>
                            <div className="py-1 max-h-[160px] overflow-y-auto">
                              <div className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex justify-between items-center text-[12px] text-[#333]">
                                <div className="flex items-center gap-2"><Folder size={12} className="text-[#888]"/> {activeWorkspace?.name || 'AI-agent'}</div>
                                <CheckIcon size={12} />
                              </div>
                              {workspaces.map((w, idx) => (
                                <div key={idx} className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex items-center gap-2 text-[12px] text-[#555]" onClick={() => {
                                  if (window.electronAPI) {
                                    window.electronAPI.workspace.setActive(w.path);
                                    setActiveWorkspace(w);
                                    setShowProjectDropdown(false);
                                  }
                                }}>
                                  <Folder size={12} className="text-[#888]"/> {w.name}
                                </div>
                              ))}
                            </div>
                            <div className="border-t border-[#eee] py-1 relative">
                              <div 
                                className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex justify-between items-center text-[12px] text-[#333]"
                                onMouseEnter={() => setShowNewProjectSubmenu(true)}
                                onMouseLeave={() => setShowNewProjectSubmenu(false)}
                              >
                                <div className="flex items-center gap-2"><PlusCircle size={12} className="text-[#888]"/> 添加新项目</div>
                                <ChevronRight size={12} className="text-[#888]" />
                                
                                {showNewProjectSubmenu && (
                                  <div className="absolute left-full bottom-0 ml-1 w-[180px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg py-1 z-50">
                                    <div className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex items-center gap-2 text-[12px] text-[#333]">
                                      <PlusCircle size={12} className="text-[#888]"/> 新建空白项目
                                    </div>
                                    <div 
                                      className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex items-center gap-2 text-[12px] text-[#333]"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (window.electronAPI) {
                                          const result = await window.electronAPI.workspace.add();
                                          if (result) {
                                            setWorkspaces([...workspaces, result]);
                                            setActiveWorkspace(result);
                                            setShowProjectDropdown(false);
                                            setShowNewProjectSubmenu(false);
                                          }
                                        }
                                      }}
                                    >
                                      <Folder size={12} className="text-[#888]"/> 使用现有文件夹
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex items-center gap-2 text-[12px] text-[#333]">
                                <Monitor size={12} className="text-[#888]"/> 不使用项目
                              </div>
                            </div>
                          </div>
                       )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] text-[#888] cursor-pointer hover:text-[#555]">
                       <Monitor size={14} /> 本地模式 <ChevronDown size={12} />
                    </div>
                    <div 
                      className="flex items-center gap-1.5 text-[12px] text-[#888] cursor-pointer hover:text-[#555] relative"
                      onClick={(e) => { e.stopPropagation(); setShowBranchDropdown(!showBranchDropdown); setShowProjectDropdown(false); }}
                    >
                       <div className="w-1.5 h-1.5 rounded-full bg-[#ccc]"></div> {currentBranch} <ChevronDown size={12} />
                       
                       {/* Branch Dropdown */}
                       {showBranchDropdown && (
                          <div className="absolute top-full left-0 mt-2 w-[240px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg z-50 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="p-2 border-b border-[#eee]">
                              <div className="relative">
                                <Search size={12} className="absolute left-2 top-2 text-[#aaa]" />
                                <input type="text" placeholder="搜索分支" className="w-full bg-[#f5f5f5] rounded-md py-1.5 pl-6 pr-2 text-[12px] outline-none" />
                              </div>
                            </div>
                            <div className="px-3 py-1.5 text-[11px] font-semibold text-[#888]">分支</div>
                            <div className="py-1 max-h-[160px] overflow-y-auto">
                              {gitBranches.map((branch, idx) => (
                                <div key={idx} className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex justify-between items-start text-[12px] text-[#333]" onClick={() => {
                                  if (window.electronAPI && activeWorkspace) {
                                    window.electronAPI.git.checkout(activeWorkspace.path, branch.name).then((success: boolean) => {
                                      if (success) {
                                        setCurrentBranch(branch.name);
                                        setShowBranchDropdown(false);
                                      }
                                    });
                                  }
                                }}>
                                  <div className="flex items-start gap-2">
                                    <div className="mt-0.5"><div className="w-1.5 h-1.5 rounded-full bg-[#888]"></div></div>
                                    <div>
                                      <div className={`font-medium ${branch.isCurrent ? 'text-codex-blue' : ''}`}>{branch.name}</div>
                                    </div>
                                  </div>
                                  {branch.isCurrent && <CheckIcon size={12} className="mt-1" />}
                                </div>
                              ))}
                            </div>
                            <div className="border-t border-[#eee] py-1">
                              <div className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex items-center gap-2 text-[12px] text-[#333]">
                                <PlusCircle size={12} className="text-[#888]"/> 创建并检出新分支...
                              </div>
                              <div className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer flex items-center gap-2 text-[12px] text-[#333]">
                                切换分支
                              </div>
                            </div>
                          </div>
                       )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center gap-3 text-[13px] text-[#666] cursor-pointer hover:text-black group">
                      <div className="text-[#ccc] group-hover:text-black"><Monitor size={16} /></div>
                      把新文档解析链路接到可演示的上传入口
                    </div>
                    <div className="w-full h-[1px] bg-[#f0f0f0]"></div>
                    <div className="flex items-center gap-3 text-[13px] text-[#666] cursor-pointer hover:text-black group">
                      <div className="text-[#ccc] group-hover:text-black"><Monitor size={16} /></div>
                      用现成品牌图把桌面端打包链路补到可出包
                    </div>
                    <div className="w-full h-[1px] bg-[#f0f0f0]"></div>
                    <div className="flex items-center gap-3 text-[13px] text-[#666] cursor-pointer hover:text-black group">
                      <div className="text-[#ccc] group-hover:text-black"><LayoutGridIcon size={16} /></div>
                      将你常用的应用连接到 Codex
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="max-w-3xl mx-auto space-y-6 pb-[120px] w-full">
                  {/* Background Sub-Agents Panel Mockup */}
                  {showSubAgentsPanel && (
                    <div className="bg-[#f8f9fa] border border-[#e5e5e5] rounded-xl p-3 shadow-sm mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[13px] font-semibold text-[#333] flex items-center gap-1.5"><Waypoints size={14} className="text-[#a074f3]"/> 后台子代理运行中</div>
                        <X size={14} className="text-[#aaa] cursor-pointer hover:text-[#333]" onClick={() => setShowSubAgentsPanel(false)} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[12px]">
                          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse"></div> <span className="text-[#555]">研究代理 (Research Agent)</span></div>
                          <span className="text-[#888]">正在分析路由配置...</span>
                        </div>
                        <div className="flex items-center justify-between text-[12px]">
                          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#f59e0b] rounded-full"></div> <span className="text-[#555]">代码代理 (Code Agent)</span></div>
                          <span className="text-[#888]">等待研究结果...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col gap-2">
                      {msg.type === 'memory_retrieval' ? (
                        <div className="self-start bg-[#f0f4f8] text-[#0366d6] border border-[#c8e1ff] px-3 py-1.5 rounded-full text-[12px] flex items-center gap-1.5 shadow-sm">
                          <Bot size={14} />
                          {msg.content}
                        </div>
                      ) : msg.type === 'sandbox_approval' ? (
                        <div className="self-start bg-[#fff5f5] border border-[#ffe3e3] rounded-xl p-4 shadow-sm w-[90%] max-w-[500px]">
                          <div className="flex items-center gap-2 text-[#cb2431] font-semibold text-[13px] mb-2">
                            <ShieldAlert size={16} /> 沙箱拦截: 需要您的授权
                          </div>
                          <div className="text-[13px] text-[#24292e] mb-3">
                            <p className="mb-1 text-[#555]">{msg.reason}</p>
                            <code className="bg-[#f6f8fa] border border-[#e1e4e8] px-2 py-1 rounded text-[#24292e] font-mono text-[12px] block break-all">
                              {msg.command}
                            </code>
                          </div>
                          <div className="flex gap-2">
                            <button className="flex-1 bg-[#2ea44f] text-white py-1.5 rounded text-[13px] font-medium hover:bg-[#2c974b] transition-colors flex items-center justify-center gap-1">
                              <CheckIcon size={14} /> 允许执行
                            </button>
                            <button className="flex-1 bg-[#fafbfc] text-[#cb2431] border border-[#e1e4e8] py-1.5 rounded text-[13px] font-medium hover:bg-[#f3f4f6] transition-colors flex items-center justify-center gap-1">
                              <X size={14} /> 拒绝并退回
                            </button>
                          </div>
                        </div>
                      ) : msg.role === 'agent' || msg.role === 'assistant' ? (
                        <>
                          <div className="text-[12px] text-[#888] flex items-center gap-1">
                            已处理 {msg.time || msg.timestamp} <ChevronRight size={12} />
                          </div>
                          {msg.sources && (
                            <div className="flex items-center gap-2 mt-2 mb-1 flex-wrap">
                              <span className="text-[12px] text-[#888] font-medium mr-1">来源</span>
                              {msg.sources.map((src: any, idx: number) => (
                                <a key={idx} href={src.url} className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f5f5f5] hover:bg-[#ebebeb] rounded-md text-[12px] text-[#555] transition-colors border border-[#e5e5e5]">
                                  {src.type === 'web' ? <Globe size={12} className="text-[#888]" /> : <FileText size={12} className="text-[#888]" />}
                                  <span className="truncate max-w-[150px]">{src.title}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="text-[14px] text-[#333] whitespace-pre-wrap leading-relaxed mt-1">
                            {msg.content.split('\n').map((line: string, i: number) => {
                               if (line.startsWith('- ')) {
                                 return <div key={i} className="ml-4 flex items-start gap-2">
                                   <span className="mt-1.5 w-1 h-1 bg-black rounded-full shrink-0"></span>
                                   <span dangerouslySetInnerHTML={{__html: line.substring(2).replace(/`([^`]+)`/g, '<code class="bg-[#f5f5f5] border border-[#e5e5e5] px-1 rounded text-[#e83e8c] text-[12px] font-mono">$1</code>')}}></span>
                                 </div>
                               }
                               return <div key={i} className="min-h-[20px]">{line}</div>
                            })}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[#888]">
                            <ThumbsUp size={14} className="cursor-pointer hover:text-black" />
                            <ThumbsDown size={14} className="cursor-pointer hover:text-black" />
                            <CornerUpLeft size={14} className="cursor-pointer hover:text-black" />
                            <Share size={14} className="cursor-pointer hover:text-black" />
                          </div>
                        </>
                      ) : (
                        <div className="self-end bg-[#f5f5f5] text-[#333] px-4 py-2.5 rounded-2xl max-w-[80%] text-[14px] whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Fixed Input at bottom when there are messages */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4">
                  {/* Removed overflow-hidden so dropdowns can pop out */}
                  <div className="bg-white border border-[#e5e5e5] shadow-sm rounded-xl flex flex-col focus-within:border-codex-blue focus-within:ring-1 focus-within:ring-codex-blue transition-all">
                    <textarea 
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      className="w-full min-h-[60px] max-h-[200px] p-3 text-[14px] bg-transparent outline-none resize-none placeholder-[#aaa] rounded-t-xl"
                      placeholder="要求后续变更"
                    />
                    <div className="flex items-center justify-between px-3 py-2 bg-[#fafafa] border-t border-[#f0f0f0] rounded-b-xl">
                      <div className="flex items-center gap-3 relative">
                        <PlusCircle size={16} className="text-[#888] cursor-pointer hover:text-black" />
                        <div 
                          className="flex items-center gap-1 text-[12px] font-medium text-[#ff5f56] cursor-pointer hover:opacity-80"
                          onClick={(e) => { e.stopPropagation(); setShowContextDropdown(!showContextDropdown); setShowReasoningDropdown(false); setShowPlusDropdown(false); setShowMicPopover(false); }}
                        >
                          <span className="border border-[#ff5f56] rounded-full w-4 h-4 flex items-center justify-center text-[10px]">!</span>
                          {contextMode.replace('权限', '')} <ChevronDown size={12} />
                        </div>
                        {showContextDropdown && (
                          <div className="absolute bottom-full left-6 mb-3 w-[340px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg p-3 z-50 text-left" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center px-1 mb-2">
                              <span className="text-[13px] text-[#888] font-medium">应如何批准 Codex 操作？</span>
                              <a href="#" className="text-[12px] text-[#888] hover:underline underline-offset-2">了解更多</a>
                            </div>
                            <div className="flex flex-col gap-1">
                              <div className="p-2.5 rounded-xl cursor-pointer flex items-start gap-3 hover:bg-[#f5f5f5]" onClick={() => { setContextMode('请求批准'); setShowContextDropdown(false); }}>
                                <Hand size={20} className="mt-0.5 text-[#555]" />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[14px] text-[#333] font-medium">请求批准</span>
                                    {contextMode === '请求批准' && <CheckIcon size={16} className="text-[#333]" />}
                                  </div>
                                  <div className="text-[13px] text-[#888] mt-0.5">编辑外部文件和使用互联网时始终询问</div>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-xl cursor-pointer flex items-start gap-3 hover:bg-[#f5f5f5]" onClick={() => { setContextMode('替我审批'); setShowContextDropdown(false); }}>
                                <Bot size={20} className="mt-0.5 text-[#555]" />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[14px] text-[#333] font-medium">替我审批</span>
                                    {contextMode === '替我审批' && <CheckIcon size={16} className="text-[#333]" />}
                                  </div>
                                  <div className="text-[13px] text-[#888] mt-0.5">仅对检测到的风险操作请求批准</div>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-xl cursor-pointer flex items-start gap-3 hover:bg-[#f5f5f5]" onClick={() => { setContextMode('完全访问权限'); setShowContextDropdown(false); }}>
                                <CircleAlert size={20} className="mt-0.5 text-[#555]" />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[14px] text-[#333] font-medium">完全访问权限</span>
                                    {contextMode === '完全访问权限' && <CheckIcon size={16} className="text-[#333]" />}
                                  </div>
                                  <div className="text-[13px] text-[#888] mt-0.5">可不受限制地访问互联网和您电脑上的任何文件</div>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-xl cursor-pointer flex items-start gap-3 hover:bg-[#f5f5f5]" onClick={() => { setContextMode('自定义'); setShowContextDropdown(false); }}>
                                <Settings size={20} className="mt-0.5 text-[#555]" />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[14px] text-[#333] font-medium">自定义 (config.toml)</span>
                                    {contextMode === '自定义' && <CheckIcon size={16} className="text-[#333]" />}
                                  </div>
                                  <div className="text-[13px] text-[#888] mt-0.5">使用 config.toml 中定义的权限</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-[12px] text-[#555] cursor-pointer">
                          <RefreshCw size={12} className="text-[#888]"/> 5.4-Mini 低 <ChevronDown size={12} />
                        </div>
                        <Mic size={16} className="text-[#888] cursor-pointer hover:text-black" />
                        <button 
                          onClick={handleSend}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${inputText.trim() ? 'bg-black text-white' : 'bg-[#e5e5e5] text-[#888]'}`}
                        >
                          <ArrowUp size={14} className={inputText.trim() ? "text-white" : "text-[#aaa]"} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {currentView === 'automation' && (
        <div className="flex-1 flex flex-col bg-white px-10 py-12">
           <h2 className="text-[24px] font-semibold mb-6">自动化</h2>
           <div className="text-[14px] font-medium mb-4">当前</div>
           <div className="flex justify-between items-center text-[13px] text-[#555] bg-[#fafafa] px-3 py-2 rounded-lg border border-[#e5e5e5]">
             <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 bg-[#888] rounded-full"></div>
               <span className="font-medium text-[#333]">Developer Benefits Watch</span>
               <span>心跳 · 申请 Codex for OSS</span>
             </div>
             <div className="text-[#888] text-[12px]">星期一 (时间: 6:41)</div>
           </div>
        </div>
      )}

      {currentView === 'plugins' && (
        <div className="flex-1 flex flex-col bg-[#fcfcfc] overflow-y-auto">
          {/* Header Tab */}
          <div className="flex items-center gap-4 px-6 py-4 font-medium text-[14px]">
            <div 
              className={`cursor-pointer ${pluginTab === 'plugins' ? 'text-black font-semibold' : 'text-[#888] hover:text-[#555]'}`}
              onClick={() => setPluginTab('plugins')}
            >
              插件
            </div>
            <div 
              className={`cursor-pointer ${pluginTab === 'skills' ? 'text-black font-semibold' : 'text-[#888] hover:text-[#555]'}`}
              onClick={() => setPluginTab('skills')}
            >
              技能
            </div>
            <div className="ml-auto flex items-center gap-3 text-[#888]">
              <PlusCircle size={16} className="cursor-pointer hover:text-black" />
              <RefreshCw size={14} className="cursor-pointer hover:text-black" />
            </div>
          </div>

          <div className="px-10 py-6 max-w-3xl">
            {pluginTab === 'plugins' ? (
              <>
                <h2 className="text-[24px] font-semibold mb-2">插件</h2>
                <p className="text-[#666] text-[14px] mb-8">在你常用的工具中使用 Codex</p>
                
                <div className="relative mb-6">
                  <Search size={16} className="absolute left-3 top-2.5 text-[#888]" />
                  <input type="text" placeholder="搜索插件和技能" className="w-full bg-[#f5f5f5] border border-[#e5e5e5] rounded-xl py-2 pl-9 pr-4 text-[14px] outline-none focus:bg-white focus:border-codex-blue transition-colors" />
                  <div className="absolute right-2 top-1.5 w-7 h-7 flex items-center justify-center border border-[#e5e5e5] rounded-lg cursor-pointer hover:bg-white">
                    <FilterIcon size={14} className="text-[#888]"/>
                  </div>
                </div>

                <div className="flex gap-4 mb-8 text-[13px]">
                   <div className="bg-white border border-[#e5e5e5] rounded-full px-3 py-1 font-medium cursor-pointer shadow-sm">由 OpenAI 精选</div>
                   <div className="text-[#666] px-3 py-1 cursor-pointer">claude-plugins-official</div>
                   <div className="text-[#666] px-3 py-1 cursor-pointer">superpowers-marketplace</div>
                </div>

                <div className="text-[14px] font-medium mb-4 flex justify-between">
                  已添加
                  <span className="text-[#888] text-[12px] font-normal cursor-pointer">管理</span>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-8">
                   <div className="w-8 h-8 flex items-center justify-center bg-white border border-[#e5e5e5] rounded-lg shadow-sm text-blue-500 font-bold">G</div>
                   <div className="w-8 h-8 flex items-center justify-center bg-white border border-[#e5e5e5] rounded-lg shadow-sm text-red-500 font-bold">P</div>
                   <div className="w-8 h-8 flex items-center justify-center bg-white border border-[#e5e5e5] rounded-lg shadow-sm text-green-500 font-bold">X</div>
                   <div className="w-8 h-8 flex items-center justify-center bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg text-[#888] text-[12px] font-medium cursor-pointer hover:bg-[#ebebeb]">+32</div>
                </div>

                <div className="text-[14px] font-medium mb-4">Featured</div>
                
                <div className="space-y-3 pb-20">
                  {[
                    { name: 'Slack', desc: 'Read and manage Slack', icon: 'S', color: 'text-purple-500' },
                    { name: 'Notion', desc: 'Notion workflows for specs, research, meetings, and knowledge capture', icon: 'N', color: 'text-black' },
                    { name: 'Linear', desc: 'Find and reference issues and projects.', icon: 'L', color: 'text-indigo-500' },
                    { name: 'Google Calendar', desc: 'Manage Google Calendar events and schedules', icon: '31', color: 'text-blue-500' },
                    { name: 'Google Drive', desc: 'Work across Drive, Docs, Sheets, and Slides', icon: '△', color: 'text-yellow-500' }
                  ].map(p => (
                    <div key={p.name} className="flex items-center justify-between py-2 border-b border-transparent hover:border-[#eee]">
                       <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 flex items-center justify-center bg-white border border-[#e5e5e5] rounded-lg shadow-sm text-[14px] font-bold ${p.color}`}>{p.icon}</div>
                          <div>
                            <div className="font-medium text-[14px]">{p.name}</div>
                            <div className="text-[#888] text-[12px] mt-0.5">{p.desc}</div>
                          </div>
                       </div>
                       <button className="bg-white border border-[#e5e5e5] px-4 py-1.5 rounded-lg text-[13px] font-medium text-[#555] hover:bg-[#fafafa] shadow-sm">添加插件</button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[24px] font-semibold mb-2">技能</h2>
                <p className="text-[#666] text-[14px] mb-8">通过任务专用技能扩展 Codex 的能力</p>
                
                <div className="relative mb-6">
                  <Search size={16} className="absolute left-3 top-2.5 text-[#888]" />
                  <input type="text" placeholder="搜索插件和技能" className="w-full bg-[#f5f5f5] border border-[#e5e5e5] rounded-xl py-2 pl-9 pr-4 text-[14px] outline-none focus:bg-white focus:border-codex-blue transition-colors" />
                  <div className="absolute right-2 top-1.5 w-7 h-7 flex items-center justify-center border border-[#e5e5e5] rounded-lg cursor-pointer hover:bg-white">
                    <FilterIcon size={14} className="text-[#888]"/>
                  </div>
                </div>

                <div className="text-[14px] font-medium mb-4 mt-8">个人</div>
                
                <div className="space-y-4">
                  {[
                    { name: 'Ab Test Setup', desc: 'When the user wants to plan, design, or implement an A/B test or experiment. Also use when the use...' },
                    { name: 'Agent Deep Links', desc: 'Build and verify app deep links for Slack and handoffs.' },
                    { name: 'Agent Md Refactor', desc: 'Refactor bloated AGENTS.md, AGENTS.md, or similar agent instruction files to follow progressive...' },
                    { name: 'Agent Tools', desc: 'Run 150+ AI apps via inference.sh CLI - image generation, video creation, LLMs, search, 3D, Twitter...' },
                    { name: 'Ai Avatar Video', desc: 'Create AI avatar and talking head videos with OmniHuman, Fabric, PixVerse via inference.sh CLI....' }
                  ].map(p => (
                    <div key={p.name} className="flex items-start justify-between py-2">
                       <div className="flex items-start gap-4">
                          <div className="w-8 h-8 flex items-center justify-center bg-white border border-[#e5e5e5] rounded-lg shadow-sm text-orange-500 font-bold shrink-0">❖</div>
                          <div>
                            <div className="font-medium text-[13px]">{p.name}</div>
                            <div className="text-[#888] text-[12px] mt-0.5">{p.desc}</div>
                          </div>
                       </div>
                       <CheckIcon size={14} className="text-[#ccc] mt-1 shrink-0" />
                    </div>
                  ))}
                </div>

                <div className="text-[12px] text-[#888] mt-6 mb-10 cursor-pointer hover:text-[#555]">查看 Ai Image Generation, Ai Plugins: Endor Setup 等另外 562 项</div>

                <div className="text-[14px] font-medium mb-4">trae-</div>
                
                <div className="space-y-4 pb-20">
                  {[
                    { name: 'Agent Browser', desc: 'Browser automation CLI for AI agents. Use when the user needs to interact with websites, including...' },
                    { name: 'Brainstorming', desc: 'You MUST use this before any creative work - creating features, building components, adding...' }
                  ].map(p => (
                    <div key={p.name} className="flex items-start justify-between py-2">
                       <div className="flex items-start gap-4">
                          <div className="w-8 h-8 flex items-center justify-center bg-white border border-[#e5e5e5] rounded-lg shadow-sm text-gray-500 font-bold shrink-0">⚙</div>
                          <div>
                            <div className="font-medium text-[13px]">{p.name}</div>
                            <div className="text-[#888] text-[12px] mt-0.5">{p.desc}</div>
                          </div>
                       </div>
                       <CheckIcon size={14} className="text-[#ccc] mt-1 shrink-0" />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Right Sidebar */}
      {currentView === 'chat' && (
        <div 
          className={`bg-[#fcfcfc] border-l border-[#e5e5e5] flex flex-col shrink-0 relative ${isResizingRightPanel ? '' : 'transition-all'}`}
          style={{ width: rightPanelWidth !== null ? rightPanelWidth : (activeRightTab === 'files' || activeRightTab === 'gitdiff' ? 640 : activeRightTab === 'browser' ? 400 : activeRightTab === 'sidechat' ? 380 : 300) }}
        >
          <div 
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#007aff] z-50 flex items-center justify-center group"
            onMouseDown={(e) => { e.preventDefault(); setIsResizingRightPanel(true); }}
          >
            <div className="w-[2px] h-8 bg-transparent group-hover:bg-[#007aff] rounded-full transition-colors" />
          </div>
          {activeRightTab === 'env' ? (
            <div className="p-4 relative h-full">
              <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-[#f0f0f0]">
                  <span className="text-[14px] font-medium text-[#555]">环境信息</span>
                  <Settings size={14} className="text-[#888] cursor-pointer hover:text-[#555]" />
                </div>
                <div className="p-2 space-y-0.5">
                  <div className="flex items-center justify-between p-2.5 hover:bg-[#f5f5f5] rounded-xl cursor-pointer transition-colors" onClick={() => setActiveRightTab('gitdiff')}>
                    <div className="flex items-center gap-2.5 text-[13px] text-[#333]">
                      <PlusSquare size={16} className="text-[#555]" /> 变更
                    </div>
                    <div className="text-[13px]"><span className="text-[#27c93f]">+8,151</span> <span className="text-[#e04523]">-183</span></div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 hover:bg-[#f5f5f5] rounded-xl cursor-pointer transition-colors">
                    <div className="flex items-center gap-2.5 text-[13px] text-[#333]">
                      <Monitor size={16} className="text-[#555]" /> 本地 <ChevronDown size={14} className="text-[#888]" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 hover:bg-[#f5f5f5] rounded-xl cursor-pointer transition-colors">
                    <div className="flex items-center gap-2.5 text-[13px] text-[#333]">
                      <GitBranch size={16} className="text-[#555]" /> main <ChevronDown size={14} className="text-[#888]" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 hover:bg-[#f5f5f5] rounded-xl cursor-pointer transition-colors" onClick={() => setShowCommitPopup(!showCommitPopup)}>
                    <div className="flex items-center gap-2.5 text-[13px] text-[#333]">
                      <GitCommit size={16} className="text-[#555]" /> 提交或推送
                    </div>
                  </div>
                </div>
                <div className="border-t border-[#f0f0f0] p-4">
                  <div className="text-[13px] text-[#888] mb-3">来源</div>
                  <Globe size={16} className="text-[#555]" />
                </div>
              </div>

              {/* Commit Popup Overlay */}
              {showCommitPopup && (
                <div className="absolute right-[280px] top-32 w-[380px] bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.1)] border border-[#e5e5e5] flex flex-col z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0]">
                    <div className="flex items-center gap-2 text-[13px] text-[#333] cursor-pointer bg-[#f5f5f5] px-2 py-1 rounded-md">
                      <GitBranch size={14} className="text-[#555]" /> main <ChevronDown size={14} className="text-[#888]" />
                    </div>
                    <div className="text-[13px] font-medium"><span className="text-[#27c93f]">+325</span> <span className="text-[#e04523]">-88</span></div>
                  </div>
                  <div className="p-3">
                    <textarea 
                      placeholder="提交信息 (留空将自动生成) ..." 
                      className="w-full h-[80px] resize-none outline-none text-[13px] text-[#333] placeholder-[#aaa] bg-transparent"
                    />
                  </div>
                  <div className="px-4 py-2 flex items-center gap-2 border-t border-[#f0f0f0] cursor-pointer hover:bg-[#fafafa]">
                    <CheckSquare size={14} className="text-[#333]" />
                    <span className="text-[13px] text-[#555]">包含未暂存的更改</span>
                  </div>
                  <div className="p-2 space-y-1 bg-[#fafafa] rounded-b-xl border-t border-[#f0f0f0]">
                    <div className="flex items-center justify-between px-3 py-2 hover:bg-[#f0f0f0] rounded-lg cursor-pointer text-[13px] text-[#333]">
                      <div className="flex items-center gap-2 font-medium"><GitCommit size={14} className="text-[#555]" /> 提交</div>
                      <div className="text-[12px] text-[#888] border border-[#ccc] bg-white px-1.5 rounded shadow-sm">⌘↵</div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-[#f0f0f0] rounded-lg cursor-pointer text-[13px] text-[#333]">
                      <UploadCloud size={14} className="text-[#555]" /> 提交并推送
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-[#f0f0f0] rounded-lg cursor-pointer text-[13px] text-[#333]">
                      <UploadCloud size={14} className="text-[#555]" /> 推送
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeRightTab === 'menu' ? (
            <div className="p-4 flex flex-col gap-2">
              <div className="flex justify-end mb-2 text-[#888] gap-2">
                 <Monitor size={16} />
                 <div className="w-4 h-4 border border-[#888] rounded flex items-center justify-center cursor-pointer">
                   <div className="w-2 h-2 bg-[#888]"></div>
                 </div>
              </div>
              <RightTool icon={CheckSquare} label="审查" shortcut="^⇧G" onClick={() => setActiveRightTab('review')} />
              <RightTool icon={TerminalSquare} label="终端" onClick={() => setTerminalOpen(!terminalOpen)} />
              <RightTool icon={Globe} label="浏览器" shortcut="⌘T" onClick={() => setActiveRightTab('browser')} />
              <RightTool icon={FileText} label="文件" shortcut="⌘P" onClick={() => setActiveRightTab('files')} />
              <RightTool icon={MessageSquare} label="侧边聊天" shortcut="⌥⌘S" onClick={() => setActiveRightTab('sidechat')} />
            </div>
          ) : activeRightTab === 'review' ? (
            <div className="flex flex-col h-full bg-white">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5]">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-[#f0f0f0] px-2 py-1 rounded-md text-[13px] font-medium text-[#333] cursor-pointer" onClick={() => setActiveRightTab('menu')}>
                    <ArrowUp size={14} className="text-[#555]" /> 审查
                  </div>
                  <Plus size={16} className="text-[#888] cursor-pointer hover:text-[#333]" />
                </div>
                <div className="flex items-center gap-2 text-[#888]">
                  <Monitor size={14} className="cursor-pointer hover:text-[#333]" />
                  <Minus size={14} className="cursor-pointer hover:text-[#333]" />
                  <PanelRight size={14} className="cursor-pointer hover:text-[#333]" onClick={() => setActiveRightTab('menu')} />
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5]">
                <div className="flex items-center gap-1 text-[13px] text-[#333] font-medium cursor-pointer">
                  上轮对话 <ChevronDown size={14} />
                </div>
                <div className="flex items-center gap-3 text-[#888]">
                  <div className="flex gap-0.5 cursor-pointer hover:text-[#333]"><div className="w-1 h-1 bg-current rounded-full"></div><div className="w-1 h-1 bg-current rounded-full"></div><div className="w-1 h-1 bg-current rounded-full"></div></div>
                  <FileText size={14} className="cursor-pointer hover:text-[#333]" />
                  <LayoutGridIcon size={14} className="cursor-pointer hover:text-[#333]" />
                  <Folder size={14} className="cursor-pointer hover:text-[#333]" />
                  <Share size={14} className="cursor-pointer hover:text-[#333]" />
                  <GitBranch size={14} className="cursor-pointer hover:text-[#333]" />
                </div>
              </div>
              <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <div className="p-2 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
                  <div className="flex items-center gap-2 text-[12px] text-[#555]">
                    <input type="checkbox" className="rounded-sm border-[#ccc]" defaultChecked />
                    <span>{gitStatusFiles.length} 个文件</span>
                  </div>
                  <div 
                    className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-[#a074f3]/10 to-[#8050e3]/10 text-[#8050e3] text-[12px] rounded border border-[#a074f3]/20 cursor-pointer hover:from-[#a074f3]/20 hover:to-[#8050e3]/20 transition-all font-medium"
                    onClick={() => {
                      setIsDeepReviewing(true);
                      setTimeout(() => setIsDeepReviewing(false), 2000);
                    }}
                  >
                    <Wand2 size={12} /> {isDeepReviewing ? '正在深度审查...' : '✨ 一键 AI 审查'}
                  </div>
                </div>
                {/* Simulated AI Deep Review Result */}
                {isDeepReviewing && (
                  <div className="mx-2 mt-2 p-3 bg-[#f1f8ff] border border-[#c8e1ff] rounded-lg text-[12px] text-[#24292e]">
                    <div className="flex items-center gap-1.5 font-bold mb-1 text-[#0366d6]"><Bot size={14} /> AI 审查中...</div>
                    <div className="animate-pulse flex space-x-2">
                      <div className="h-2 bg-[#c8e1ff] rounded w-3/4"></div>
                    </div>
                  </div>
                )}
                {!isDeepReviewing && Object.keys(inlineReviews).length > 0 && (
                  <div className="mx-2 mt-2 p-3 bg-white border border-[#e1e4e8] shadow-sm rounded-lg text-[12px] text-[#24292e]">
                    <div className="flex items-center gap-1.5 font-bold mb-2 text-[#24292e]"><Bot size={14} className="text-[#a074f3]"/> AI 审查建议</div>
                    <div className="text-[#586069] leading-relaxed">检测到代码中有一处建议重构，已在 <span className="font-mono bg-[#f6f8fa] px-1 rounded border border-[#e1e4e8] cursor-pointer hover:text-[#0366d6]" onClick={() => setActiveRightTab('gitdiff')}>Diff 视图</span> 中进行批注。</div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {gitStatusFiles.map((fileStatus, index) => (
                    <div key={index} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer text-[13px] text-[#333]" onClick={() => setActiveRightTab('gitdiff')}>
                      <input type="checkbox" className="rounded-sm border-[#ccc]" defaultChecked />
                      <FileText size={14} className="text-[#888]" />
                      <span className="flex-1 truncate">{fileStatus.file.split('/').pop()}</span>
                      <span className="text-[12px] font-medium text-[#888]">{fileStatus.status}</span>
                      <span className="text-[11px] text-[#aaa] truncate max-w-[100px]">{fileStatus.file.split('/').slice(0, -1).join('/')}</span>
                    </div>
                  ))}
                  {gitStatusFiles.length === 0 && (
                    <div className="text-center text-[#888] text-[13px] mt-4">尚无文件更改</div>
                  )}
                </div>
              </div>
            </div>
            ) : activeRightTab === 'browser' ? (
              <div className="flex flex-col h-full bg-white">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-[#f0f0f0] px-2 py-1 rounded-md text-[13px] font-medium text-[#333] cursor-pointer" onClick={() => setActiveRightTab('menu')}>
                      <Globe size={14} className="text-[#555]" /> 新选项卡
                    </div>
                    <Plus size={16} className="text-[#888] cursor-pointer hover:text-[#333]" />
                  </div>
                  <div className="flex items-center gap-2 text-[#888]">
                    <Maximize2 size={14} className="cursor-pointer hover:text-[#333]" />
                    <Minus size={14} className="cursor-pointer hover:text-[#333]" />
                    <PanelRight size={14} className="cursor-pointer hover:text-[#333]" onClick={() => setActiveRightTab('menu')} />
                  </div>
                </div>
                <div className="flex items-center px-3 py-2 border-b border-[#e5e5e5] gap-2 text-[#888]">
                  <ArrowLeft size={14} className="cursor-pointer hover:text-[#333]" />
                  <ArrowRight size={14} className="cursor-pointer hover:text-[#333]" />
                  <RefreshCw size={14} className="cursor-pointer hover:text-[#333]" />
                  <div className="flex-1 flex items-center bg-[#fcfcfc] rounded-md px-3 py-1 border border-[#e5e5e5] hover:border-[#ccc] transition-colors">
                    <input type="text" placeholder="输入 URL" className="flex-1 bg-transparent text-[13px] outline-none text-[#333]" />
                    <ExternalLink size={14} className="text-[#888] cursor-pointer hover:text-[#333]" />
                  </div>
                  <MoreVertical size={16} className="cursor-pointer hover:text-[#333]" />
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-white">
                  <div className="flex items-center justify-between mb-3 text-[#888] px-1">
                    <span className="text-[13px] font-medium">本地</span>
                    <FilterIcon size={14} className="cursor-pointer hover:text-[#333]" />
                  </div>
                  <div className="space-y-3">
                    {[
                      { title: 'localhost:8082', url: 'localhost:8082' },
                      { title: 'renderer', url: 'localhost:5173' }
                    ].map((site, i) => (
                      <div key={i} className="bg-white border border-[#e5e5e5] rounded-xl p-3 flex items-center justify-between cursor-pointer hover:border-[#ccc] hover:shadow-sm transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-9 border border-[#e5e5e5] rounded shadow-sm flex flex-col justify-center px-2 bg-white">
                             <div className="flex gap-0.5 mb-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#ff5f56]"></div><div className="w-1.5 h-1.5 rounded-full bg-[#ffbd2e]"></div><div className="w-1.5 h-1.5 rounded-full bg-[#27c93f]"></div></div>
                             <div className="w-full h-1 bg-[#ddd] rounded-full mb-1"></div>
                             <div className="w-2/3 h-1 bg-[#ddd] rounded-full"></div>
                          </div>
                          <div>
                            <div className="text-[14px] font-medium text-[#333] mb-0.5">{site.title}</div>
                            <div className="text-[13px] text-[#888]">{site.url}</div>
                          </div>
                        </div>
                        <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : activeRightTab === 'files' ? (
              <div className="flex flex-col h-full bg-white">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-[#f0f0f0] px-2 py-1 rounded-md text-[13px] font-medium text-[#333] cursor-pointer" onClick={() => setActiveRightTab('menu')}>
                      <FileText size={14} className="text-[#555]" /> hpa.yaml
                    </div>
                    <Plus size={16} className="text-[#888] cursor-pointer hover:text-[#333]" />
                  </div>
                  <div className="flex items-center gap-2 text-[#888]">
                    <Maximize2 size={14} className="cursor-pointer hover:text-[#333]" />
                    <Minus size={14} className="cursor-pointer hover:text-[#333]" />
                    <PanelRight size={14} className="cursor-pointer hover:text-[#333]" onClick={() => setActiveRightTab('menu')} />
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5]">
                  <div className="flex items-center gap-1.5 text-[12px] text-[#888]">
                    <span className="hover:text-[#333] cursor-pointer">AI-agent</span> <ChevronRight size={12} />
                    <span className="hover:text-[#333] cursor-pointer">k8s</span> <ChevronRight size={12} />
                    <span className="text-[#333] font-medium">hpa.yaml</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#888]">
                    <MoreHorizontal size={14} className="cursor-pointer hover:text-[#333]" />
                    <div className="flex items-center gap-1.5 border border-[#e5e5e5] rounded px-2 py-0.5 text-[12px] cursor-pointer hover:bg-[#f5f5f5]">
                      <TerminalSquare size={12} className="text-[#1068bf]" /> 打开 <ChevronDown size={12} />
                    </div>
                    <Copy size={14} className="cursor-pointer hover:text-[#333]" />
                  </div>
                </div>
                <div className="flex-1 flex overflow-hidden">
                  <div className="flex-1 overflow-y-auto bg-[#fafafa] font-mono text-[12px] leading-relaxed p-4 border-r border-[#e5e5e5] whitespace-pre">
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">1</span><span className="text-[#e04523]">apiVersion</span>: <span className="text-[#27c93f]">autoscaling/v2</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">2</span><span className="text-[#e04523]">kind</span>: <span className="text-[#27c93f]">HorizontalPodAutoscaler</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">3</span><span className="text-[#e04523]">metadata</span>:</div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">4</span>  <span className="text-[#e04523]">name</span>: <span className="text-[#27c93f]">backend-hpa</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">5</span><span className="text-[#e04523]">spec</span>:</div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">6</span>  <span className="text-[#e04523]">scaleTargetRef</span>:</div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">7</span>    <span className="text-[#e04523]">apiVersion</span>: <span className="text-[#27c93f]">apps/v1</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">8</span>    <span className="text-[#e04523]">kind</span>: <span className="text-[#27c93f]">Deployment</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">9</span>    <span className="text-[#e04523]">name</span>: <span className="text-[#27c93f]">backend</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">10</span>  <span className="text-[#e04523]">minReplicas</span>: <span className="text-[#1068bf]">2</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">11</span>  <span className="text-[#e04523]">maxReplicas</span>: <span className="text-[#1068bf]">10</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">12</span>  <span className="text-[#e04523]">metrics</span>:</div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">13</span>  - <span className="text-[#e04523]">type</span>: <span className="text-[#27c93f]">Resource</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">14</span>    <span className="text-[#e04523]">resource</span>:</div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">15</span>      <span className="text-[#e04523]">name</span>: <span className="text-[#27c93f]">cpu</span></div>
                    <div className="flex"><span className="text-[#888] w-6 select-none text-right pr-3">16</span>      <span className="text-[#e04523]">target</span>:</div>
                    <div className="flex flex-col bg-[#e6f2ff] pb-2">
                      <div className="flex">
                        <span className="text-[#1068bf] w-6 select-none text-right pr-3 bg-[#cce0ff] h-6 flex items-center justify-end">18</span>
                        <div className="flex-1 pl-1 flex items-center">        <span className="text-[#e04523]">averageUtilization</span>: <span className="text-[#1068bf]">70</span></div>
                      </div>
                      <div className="pl-8 pt-2 pr-4">
                        <div className="bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-[#e5e5e5] w-full max-w-[420px] overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full border border-[#333] flex items-center justify-center">
                                <User size={12} className="text-[#333]" />
                              </div>
                              <span className="text-[13px] font-medium text-[#333]">本地评论</span>
                            </div>
                            <span className="text-[12px] text-[#aaa]">对第 R18 行发布评论</span>
                          </div>
                          <div className="px-4 pb-3">
                            <textarea placeholder="请求更改" className="w-full bg-transparent outline-none text-[13px] text-[#333] resize-none h-12" />
                            <div className="flex justify-end gap-4 items-center">
                              <button className="text-[13px] text-[#888] hover:text-[#555]">取消</button>
                              <button className="bg-[#999] hover:bg-[#888] text-white text-[13px] px-4 py-1.5 rounded-full transition-colors font-medium">注释</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-[200px] flex flex-col bg-white">
                    <div className="p-2 border-b border-[#e5e5e5]">
                      <div className="flex items-center gap-1.5 bg-[#f5f5f5] rounded px-2 py-1.5 border border-[#e5e5e5]">
                        <Search size={14} className="text-[#888]" />
                        <input type="text" placeholder="筛选文件..." className="flex-1 bg-transparent outline-none text-[13px] text-[#333]" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 text-[13px] text-[#333] space-y-0.5">
                      <div className="flex items-center gap-1.5 py-1.5 px-1 hover:bg-[#f5f5f5] rounded cursor-pointer"><ChevronRight size={14} className="text-[#888]" /> agent-router</div>
                      <div className="flex items-center gap-1.5 py-1.5 px-1 hover:bg-[#f5f5f5] rounded cursor-pointer"><ChevronRight size={14} className="text-[#888]" /> artifacts</div>
                      <div className="flex items-center gap-1.5 py-1.5 px-1 hover:bg-[#f5f5f5] rounded cursor-pointer"><ChevronRight size={14} className="text-[#888]" /> backend</div>
                      <div className="flex items-center gap-1.5 py-1.5 px-1 hover:bg-[#f5f5f5] rounded cursor-pointer"><ChevronRight size={14} className="text-[#888]" /> bug-sentinel-starter</div>
                      <div className="flex items-center gap-1.5 py-1.5 px-1 hover:bg-[#f5f5f5] rounded cursor-pointer"><ChevronRight size={14} className="text-[#888]" /> desktop</div>
                      <div className="flex items-center gap-1.5 py-1.5 px-1 hover:bg-[#f5f5f5] rounded cursor-pointer"><ChevronRight size={14} className="text-[#888]" /> env</div>
                      <div className="flex items-center gap-1.5 py-1.5 px-1 hover:bg-[#f5f5f5] rounded cursor-pointer"><ChevronDown size={14} className="text-[#888]" /> k8s</div>
                      <div className="pl-4 space-y-0.5">
                        <div className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-[#f5f5f5] rounded cursor-pointer text-[#666]"><FileText size={12} className="text-[#e04523]" /> backend-deployment.yaml</div>
                        <div className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-[#f5f5f5] rounded cursor-pointer text-[#666]"><FileText size={12} className="text-[#e04523]" /> backend-service.yaml</div>
                        <div className="flex items-center gap-1.5 py-1.5 px-2 bg-[#f0f0f0] rounded cursor-pointer text-[#333] font-medium"><FileText size={12} className="text-[#e04523]" /> hpa.yaml</div>
                        <div className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-[#f5f5f5] rounded cursor-pointer text-[#666]"><FileText size={12} className="text-[#e04523]" /> ingress.yaml</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeRightTab === 'sidechat' ? (
              <div className="flex flex-col h-full bg-[#fcfcfc]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5] bg-white">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-[#f0f0f0] px-2 py-1 rounded-md text-[13px] font-medium text-[#333] cursor-pointer" onClick={() => setActiveRightTab('menu')}>
                      <MessageSquare size={14} className="text-[#555]" /> 侧边聊天
                    </div>
                    <Plus size={16} className="text-[#888] cursor-pointer hover:text-[#333]" />
                  </div>
                  <div className="flex items-center gap-2 text-[#888]">
                    <Maximize2 size={14} className="cursor-pointer hover:text-[#333]" />
                    <Minus size={14} className="cursor-pointer hover:text-[#333]" />
                    <PanelRight size={14} className="cursor-pointer hover:text-[#333]" onClick={() => setActiveRightTab('menu')} />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-white">
                  {/* Empty Chat Space */}
                </div>
                <div className="p-4 pt-0 bg-white">
                  <div className="bg-white border border-[#e5e5e5] rounded-2xl p-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col">
                    <textarea 
                      placeholder="要求后续变更" 
                      className="w-full bg-transparent outline-none text-[14px] text-[#333] resize-none h-[40px] mb-2"
                    />
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-3 text-[#888]">
                        <Plus size={18} className="cursor-pointer hover:text-[#555]" />
                        <div className="flex items-center gap-1 cursor-pointer text-[#e04523] hover:opacity-80">
                          <CircleAlert size={16} />
                          <ChevronDown size={14} />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 cursor-pointer text-[#555] hover:text-[#333] px-1 py-1 rounded-md">
                           <div className="w-3.5 h-3.5 rounded-full border border-[#ccc]"></div>
                           <span className="text-[13px]">5.4-Mini</span>
                           <ChevronDown size={14} className="text-[#888]" />
                        </div>
                        <Mic size={16} className="text-[#888] cursor-pointer hover:text-[#555]" />
                        <button className="w-7 h-7 rounded-full bg-[#888] flex items-center justify-center hover:bg-[#777] transition-colors shadow-sm">
                          <ArrowUp size={16} className="text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeRightTab === 'gitdiff' ? (
              <div className="flex flex-col h-full bg-white">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-[#f0f0f0] px-2 py-1 rounded-md text-[13px] font-medium text-[#333] cursor-pointer" onClick={() => setActiveRightTab('env')}>
                      分支 <ChevronDown size={14} className="text-[#555]" />
                    </div>
                    <div className="text-[13px] font-medium"><span className="text-[#27c93f]">+8,198</span> <span className="text-[#e04523]">-183</span></div>
                  </div>
                  <div className="flex items-center gap-2 text-[#888]">
                    <Maximize2 size={14} className="cursor-pointer hover:text-[#333]" />
                    <Minus size={14} className="cursor-pointer hover:text-[#333]" />
                    <PanelRight size={14} className="cursor-pointer hover:text-[#333]" onClick={() => setActiveRightTab('env')} />
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5]">
                  <div className="flex items-center gap-2 text-[13px] text-[#555]">
                    main <ArrowRight size={12} className="text-[#aaa]" /> origin/main <ChevronDown size={14} className="text-[#888]" />
                  </div>
                  <div className="flex items-center gap-3 text-[#888]">
                    <MoreHorizontal size={14} className="cursor-pointer hover:text-[#333]" />
                    <Copy size={14} className="cursor-pointer hover:text-[#333]" />
                    <Columns size={14} className="cursor-pointer hover:text-[#333]" />
                    <Folder size={14} className="cursor-pointer hover:text-[#333]" />
                    <GitCommit size={14} className="cursor-pointer hover:text-[#333]" />
                    <GitBranch size={14} className="cursor-pointer hover:text-[#333]" />
                  </div>
                </div>
                <div className="flex-1 flex overflow-hidden">
                  <div className="flex-1 overflow-y-auto bg-[#fafafa] p-4 font-mono text-[12px] leading-relaxed whitespace-pre border-r border-[#e5e5e5]">
                    {gitDiffContent ? (
                      <div className="bg-white border border-[#e5e5e5] rounded-lg p-3 overflow-x-auto shadow-sm">
                        {gitDiffContent.split('\n').map((line, idx) => {
                          let colorClass = 'text-[#333]';
                          let bgClass = '';
                          if (line.startsWith('+') && !line.startsWith('+++')) {
                            colorClass = 'text-[#22863a]';
                            bgClass = 'bg-[#e6ffed]';
                          } else if (line.startsWith('-') && !line.startsWith('---')) {
                            colorClass = 'text-[#cb2431]';
                            bgClass = 'bg-[#ffeef0]';
                          } else if (line.startsWith('@@')) {
                            colorClass = 'text-[#005cc5]';
                            bgClass = 'bg-[#f1f8ff]';
                          } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
                            colorClass = 'text-[#6a737d] font-bold';
                          }
                          
                          const isHovered = hoveredLineIdx === idx;
                          const isActive = activePromptLineIdx === idx;
                          
                          return (
                            <div 
                              key={idx} 
                              className={`px-2 py-0.5 relative group ${bgClass} ${colorClass}`}
                              onMouseEnter={() => setHoveredLineIdx(idx)}
                              onMouseLeave={() => setHoveredLineIdx(null)}
                            >
                              <div className="flex items-start">
                                <span className="flex-1">{line}</span>
                                {(isHovered || isActive) && (
                                  <div 
                                    className="absolute right-2 top-0 bg-white border border-[#e5e5e5] rounded shadow-sm px-1.5 py-0.5 text-[11px] text-[#555] cursor-pointer flex items-center gap-1 hover:bg-[#f0f0f0] transition-colors z-10"
                                    onClick={() => {
                                      setActivePromptLineIdx(isActive ? null : idx);
                                      if (!isActive) setInlinePromptText('');
                                    }}
                                  >
                                    <Wand2 size={12} className="text-[#a074f3]" /> {isActive ? '取消' : 'AI 操作'}
                                  </div>
                                )}
                              </div>
                              {isActive && (
                                <div className="mt-2 mb-2 p-3 bg-white border border-[#a074f3]/30 rounded-lg shadow-sm font-sans flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <Wand2 size={14} className="text-[#a074f3]" />
                                    <input 
                                      autoFocus
                                      type="text" 
                                      className="flex-1 text-[13px] outline-none text-[#333] placeholder:text-[#aaa]" 
                                      placeholder="你想让 AI 对这段代码做些什么？例如：解释这段逻辑，或重构它..."
                                      value={inlinePromptText}
                                      onChange={(e) => setInlinePromptText(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && inlinePromptText.trim()) {
                                          setInlinePromptLoading(true);
                                          setTimeout(() => {
                                            setInlineReviews(prev => ({
                                              ...prev,
                                              [idx]: `[AI 回复] 已针对您的请求 "${inlinePromptText}" 进行了分析：这段代码可以通过使用 Optional 来避免空指针异常。您可以尝试改写为 Optional.ofNullable(...)。`
                                            }));
                                            setInlinePromptLoading(false);
                                            setInlinePromptText('');
                                          }, 1000);
                                        }
                                      }}
                                    />
                                    {inlinePromptLoading && <RefreshCw size={14} className="text-[#a074f3] animate-spin" />}
                                  </div>
                                  {inlineReviews[idx] && (
                                    <div className="mt-2 text-[12px] text-[#444] bg-[#f9f9fa] p-2 rounded border border-[#eee] leading-relaxed">
                                      {inlineReviews[idx]}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center text-[#888] mt-10">尚无文件差异或正在加载...</div>
                    )}
                  </div>
                  <div className="w-[260px] flex flex-col bg-[#fafafa]">
                    <div className="p-2 border-b border-[#e5e5e5] bg-white">
                      <div className="flex items-center gap-1.5 bg-[#f5f5f5] rounded-md px-2 py-1.5 border border-[#e5e5e5]">
                        <Search size={14} className="text-[#888]" />
                        <input type="text" placeholder="筛选文件..." className="flex-1 bg-transparent outline-none text-[13px] text-[#333]" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 text-[13px] text-[#333] space-y-0.5">
                      <div className="flex items-center gap-1.5 py-1 px-1 hover:bg-[#f0f0f0] rounded cursor-pointer"><ChevronDown size={14} className="text-[#888]" /> agent-common</div>
                      <div className="pl-4 space-y-0.5">
                        <div className="flex items-center gap-1.5 py-1 px-1 hover:bg-[#f0f0f0] rounded cursor-pointer"><ChevronDown size={14} className="text-[#888]" /> src/main/java/com...</div>
                        <div className="pl-4 space-y-0.5">
                          <div className="flex items-center gap-1.5 py-1 px-1 hover:bg-[#f0f0f0] rounded cursor-pointer"><ChevronDown size={14} className="text-[#888]" /> config</div>
                          <div className="pl-4 space-y-0.5">
                            <div className="flex items-center gap-1.5 py-1 px-2 bg-[#e5e5e5] rounded cursor-pointer text-[#333]"><FileText size={12} className="text-[#888]" /> KafkaTopicConsta...java</div>
                          </div>
                          <div className="flex items-center gap-1.5 py-1 px-1 hover:bg-[#f0f0f0] rounded cursor-pointer"><ChevronDown size={14} className="text-[#888]" /> event</div>
                          <div className="pl-4 space-y-0.5">
                            <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#f0f0f0] rounded cursor-pointer text-[#555]"><FileText size={12} className="text-[#888]" /> AgentEvent.java</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 py-1 px-1 hover:bg-[#f0f0f0] rounded cursor-pointer text-[#555]"><FileText size={14} className="text-[#888]" /> pom.xml</div>
                      
                      <div className="flex items-center gap-1.5 py-1 px-1 hover:bg-[#f0f0f0] rounded cursor-pointer mt-2"><ChevronDown size={14} className="text-[#888]" /> agent-gateway</div>
                      <div className="pl-4 space-y-0.5">
                        <div className="flex items-center gap-1.5 py-1 px-1 hover:bg-[#f0f0f0] rounded cursor-pointer"><ChevronDown size={14} className="text-[#888]" /> src/main</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
      )}

      {/* Search Modal overlay */}
      {showSearchModal && (
        <div className="absolute inset-0 bg-black/20 z-50 flex items-start justify-center pt-32" onClick={() => setShowSearchModal(false)}>
           <div className="w-[600px] bg-white rounded-xl shadow-2xl border border-[#e5e5e5] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-3 border-b border-[#eee]">
                <input autoFocus type="text" placeholder="搜索对话" className="w-full bg-transparent text-[14px] outline-none" />
              </div>
              <div className="p-2 bg-[#fafafa]">
                 <div className="text-[12px] font-semibold text-[#888] px-2 py-1 mb-1">近期对话</div>
                 {[
                   { title: '架构大升级：全面转向客户端(Desktop)与命令...', tag: 'AI-agent', key: '⌘1' },
                   { title: '猎聘、数据、内容、开发——HR的四个战场...', tag: 'AI-agent', key: '⌘2' },
                   { title: 'Play focus playlist', tag: 'liuyongze', key: '⌘3' },
                   { title: 'failed to parse plugin hooks config /Users/liuyon...', tag: 'liuyongze', key: '⌘4' }
                 ].map((c, i) => (
                   <div key={i} className={`flex justify-between items-center px-3 py-2 rounded-lg cursor-pointer ${i === 0 ? 'bg-[#e3e3e3]' : 'hover:bg-[#ebebeb]'}`}>
                      <div className="text-[13px] text-[#333] truncate pr-4">{c.title}</div>
                      <div className="flex items-center gap-2 shrink-0">
                         <span className="text-[#888] text-[12px]">{c.tag}</span>
                         <span className="bg-white border border-[#ccc] px-1.5 rounded text-[10px] text-[#888] shadow-sm font-mono">{c.key}</span>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      )}


      {/* Bottom Terminal */}
      {terminalOpen && (
        <div className="absolute bottom-0 left-0 right-0 h-[240px] bg-white border-t border-[#e5e5e5] flex flex-col z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5] bg-[#fafafa]">
            <div className="flex items-center gap-2 text-[12px] font-mono text-[#555]">
              <TerminalSquare size={14} /> AI-agent <PlusCircle size={12} className="ml-1 cursor-pointer"/>
            </div>
            <X size={14} className="text-[#888] cursor-pointer hover:text-black" onClick={() => setTerminalOpen(false)} />
          </div>
          <div className="flex-1 bg-white p-2">
             <XtermComponent />
          </div>
        </div>
      )}

      {/* Floating Hovered Chat Tooltip */}
      {hoveredChat && (
        <div 
          className="fixed z-50 bg-white border border-[#e5e5e5] rounded-xl shadow-lg p-3 w-[240px] pointer-events-none"
          style={{ top: hoveredChat.rect.top - 10, left: hoveredChat.rect.right + 10 }}
        >
          <div className="flex justify-between items-start mb-2">
             <span className="font-medium text-[#333] text-[13px]">{hoveredChat.title}</span>
             <span className="text-[11px] text-[#888] whitespace-nowrap ml-2">{hoveredChat.time}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[#888]">
             <div className="w-1.5 h-1.5 rounded-full bg-[#ccc]"></div> {hoveredChat.branch}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Subcomponents ---

const XtermComponent = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!terminalRef.current) return;
    const term = new Terminal({
      theme: { background: '#ffffff', foreground: '#333333', cursor: '#333333' },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 12,
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    const winApi = (window as any).electronAPI;
    if (winApi && winApi.terminal) {
      winApi.terminal.spawn();
      
      winApi.terminal.onData((data: string) => {
        term.write(data);
      });

      term.onData((data) => {
        winApi.terminal.write(data);
      });

      term.onResize(({ cols, rows }) => {
        winApi.terminal.resize(cols, rows);
      });

      window.addEventListener('resize', () => {
        fitAddon.fit();
      });
    } else {
      term.write('Terminal IPC not available\n');
    }

    // Cleanup
    return () => term.dispose();
  }, []);

  return <div ref={terminalRef} className="w-full h-full" />;
};

const SidebarItem = ({ icon: Icon, label, active, onClick, onArchive }: { icon: any, label: string, active?: boolean, onClick?: () => void, onArchive?: (e: any) => void }) => (
  <div onClick={onClick} className={`px-3 py-1.5 flex items-center justify-between text-[13px] rounded-lg cursor-pointer group ${active ? 'bg-[#e3e3e3] text-black font-medium' : 'text-[#555] hover:bg-[#ebebeb]'}`}>
    <div className="flex items-center gap-2 overflow-hidden">
      <Icon size={16} className={active ? "text-black shrink-0" : "text-[#888] shrink-0"} />
      <span className="truncate">{label}</span>
    </div>
    {onArchive && (
      <Archive size={14} className="text-[#888] hover:text-black hidden group-hover:block shrink-0" onClick={onArchive} />
    )}
  </div>
);

const SidebarSection = ({ title, onAdd }: { title: string, onAdd?: () => void }) => (
  <div className="px-3 pt-3 pb-1 flex items-center justify-between group">
    <div className="flex items-center gap-1 text-[11px] font-semibold text-[#888]">
      {title && <ChevronDown size={12} />}
      {title}
    </div>
    {onAdd && (
      <Plus size={14} className="text-[#888] cursor-pointer hover:text-black hidden group-hover:block" onClick={onAdd} />
    )}
  </div>
);

const MenuOption = ({ icon: Icon, label, shortcut, hasArrow, className, onClick }: any) => (
  <div onClick={onClick} className="px-3 py-1.5 flex items-center justify-between hover:bg-[#f5f5f5] rounded-md cursor-pointer text-[13px] text-[#333]">
    <div className="flex items-center gap-2">
      <Icon size={14} className={`text-[#666] ${className || ''}`} />
      <span>{label}</span>
    </div>
    {shortcut && <span className="text-[#888] text-[11px] font-mono">{shortcut}</span>}
    {hasArrow && <ChevronRight size={14} className="text-[#888]" />}
  </div>
);

const RightTool = ({ icon: Icon, label, shortcut, onClick }: any) => (
  <div onClick={onClick} className="flex items-center justify-between px-3 py-2 bg-[#f5f5f5] hover:bg-[#ebebeb] rounded-lg cursor-pointer border border-[#e5e5e5] transition-colors">
    <div className="flex items-center gap-2 text-[13px] text-[#555]">
      <Icon size={16} className="text-[#888]" />
      <span>{label}</span>
    </div>
    {shortcut && <div className="text-[11px] text-[#888] bg-[#ebebeb] px-1.5 rounded font-mono border border-[#ddd]">{shortcut}</div>}
  </div>
);
