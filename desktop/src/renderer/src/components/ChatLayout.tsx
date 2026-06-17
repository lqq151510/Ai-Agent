import { useState, useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { Settings, Search, PlusCircle, User, Zap, Folder, CheckSquare, MessageSquare, ChevronDown, Mic, ArrowUp, Link2, Monitor, FileText, PanelRight, X, ChevronRight, ThumbsUp, ThumbsDown, CornerUpLeft, Share, LayoutGrid as LayoutGridIcon, Check as CheckIcon, Pin, Trash2, RefreshCw, TerminalSquare, Filter as FilterIcon } from 'lucide-react';

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
  const [pluginTab, setPluginTab] = useState<'plugins' | 'skills'>('plugins');

  // Backend States
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<any>(null);
  const [gitBranches, setGitBranches] = useState<any[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');

  // Initial Load
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
        const agentMsg = { role: 'agent', time: '1s', content: '我明白了，我已经将内容记录下来。' };
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

          <SidebarSection title="复习" />
          {workspaces.map((w, idx) => (
             <SidebarItem key={idx} icon={Folder} label={w.name} onClick={() => {
                if (window.electronAPI) {
                  window.electronAPI.workspace.setActive(w.path);
                  setActiveWorkspace(w);
                  window.electronAPI.git.getBranches(w.path).then(setGitBranches);
                }
             }}/>
          ))}

          <div className="px-3 pt-2 pb-1 flex items-center gap-1 text-[13px] text-[#333] font-medium cursor-pointer">
            <Folder size={16} className="text-[#888]" /> {activeWorkspace?.name || '当前项目'}
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
                <span className="truncate w-[110px] font-medium">{session.title}</span>
                <span className="text-[#888] text-[11px] scale-90 group-hover:hidden">...</span>
                <div className="hidden group-hover:flex items-center gap-2 text-[#888]">
                  <Pin size={14} className="hover:text-black" />
                  <Trash2 size={14} className="hover:text-black" />
                </div>
              </div>
            ))}
          </div>

          <SidebarSection title="对话" />
          {chatSessions.filter(s => s.branch !== currentBranch).map((session) => (
            <div 
              key={session.id}
              onClick={() => handleLoadChat(session.id)}
              className={`px-3 py-1.5 flex justify-between items-center text-[12px] ${activeSessionId === session.id ? 'bg-[#e3e3e3] text-[#333]' : 'text-[#555] hover:bg-[#ebebeb]'} rounded-lg cursor-pointer`}
            >
              <span className="truncate w-[140px]">{session.title}</span>
              <span className="text-[#888] text-[11px]">...</span>
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
                  {/* Plus Dropdown */}
                  {showPlusDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 w-[240px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg p-2 z-50 text-[13px]">
                      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer text-[#333]"><Link2 size={14} className="text-[#888]" /> 添加照片和文件</div>
                      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer text-codex-blue"><Monitor size={14} /> 附加 Antigravity</div>
                      <div className="h-[1px] bg-[#eee] my-1"></div>
                      <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer text-[#333]">
                        <div className="flex items-center gap-2"><CheckSquare size={14} className="text-[#888]" /> 计划模式</div>
                        <div className="w-6 h-3.5 bg-[#ccc] rounded-full"></div>
                      </div>
                      <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer text-[#333]">
                        <div className="flex items-center gap-2"><Monitor size={14} className="text-[#888]" /> 追求目标</div>
                        <div className="w-6 h-3.5 bg-[#ccc] rounded-full"></div>
                      </div>
                      <div className="h-[1px] bg-[#eee] my-1"></div>
                      <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer text-[#333]">
                        <div className="flex items-center gap-2"><PlusCircle size={14} className="text-[#888]" /> 创建</div>
                        <ChevronRight size={14} className="text-[#888]" />
                      </div>
                      <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[#f5f5f5] rounded-md cursor-pointer text-[#333]">
                        <div className="flex items-center gap-2"><LayoutGridIcon size={14} className="text-[#888]" /> 插件</div>
                        <ChevronRight size={14} className="text-[#888]" />
                      </div>
                    </div>
                  )}

                  {/* Context Dropdown */}
                  {showContextDropdown && (
                    <div className="absolute bottom-full left-10 mb-2 w-[340px] bg-white border border-[#e5e5e5] rounded-xl shadow-lg p-2 z-50">
                      <div className="text-[12px] text-[#888] px-3 py-1 flex justify-between">
                        <span>应如何批准 Codex 操作?</span>
                        <span className="underline cursor-pointer hover:text-[#555]">了解更多</span>
                      </div>
                      <div className="mt-1 space-y-1">
                        <div className="px-3 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer" onClick={(e) => { e.stopPropagation(); setContextMode('请求批准'); setShowContextDropdown(false); }}>
                          <div className="text-[13px] text-[#333] font-medium flex items-center justify-between">请求批准 {contextMode === '请求批准' && <CheckIcon size={14} />}</div>
                          <div className="text-[12px] text-[#888]">编辑外部文件和使用互联网时始终询问</div>
                        </div>
                        <div className="px-3 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer" onClick={(e) => { e.stopPropagation(); setContextMode('替换审批'); setShowContextDropdown(false); }}>
                          <div className="text-[13px] text-[#333] font-medium flex items-center justify-between">替换审批 {contextMode === '替换审批' && <CheckIcon size={14} />}</div>
                          <div className="text-[12px] text-[#888]">仅对检测到的风险操作请求批准</div>
                        </div>
                        <div className="px-3 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer" onClick={(e) => { e.stopPropagation(); setContextMode('完全访问权限'); setShowContextDropdown(false); }}>
                          <div className="text-[13px] text-[#333] font-medium flex items-center justify-between">完全访问权限 {contextMode === '完全访问权限' && <CheckIcon size={14} />}</div>
                          <div className="text-[12px] text-[#888]">可不受限制地访问互联网和您电脑上的任何文件</div>
                        </div>
                        <div className="px-3 py-2 hover:bg-[#f5f5f5] rounded-lg cursor-pointer" onClick={(e) => { e.stopPropagation(); setContextMode('自定义'); setShowContextDropdown(false); }}>
                          <div className="text-[13px] text-[#333] font-medium flex items-center justify-between">自定义 (config.toml) {contextMode === '自定义' && <CheckIcon size={14} />}</div>
                          <div className="text-[12px] text-[#888]">使用 config.toml 中定义的权限</div>
                        </div>
                      </div>
                    </div>
                  )}

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
                        <div className="p-1 hover:bg-[#ebebeb] rounded-md cursor-pointer" onClick={(e) => { e.stopPropagation(); setShowPlusDropdown(!showPlusDropdown); setShowContextDropdown(false); setShowReasoningDropdown(false); setShowMicPopover(false); }}>
                          <PlusCircle size={16} className="text-[#888] hover:text-black" />
                        </div>
                        <div 
                          className="flex items-center gap-1 text-[12px] font-medium text-[#ff5f56] cursor-pointer hover:bg-[#fdebea] px-2 py-1 rounded-md"
                          onClick={(e) => { e.stopPropagation(); setShowContextDropdown(!showContextDropdown); setShowReasoningDropdown(false); setShowPlusDropdown(false); setShowMicPopover(false); }}
                        >
                          <span className="border border-[#ff5f56] rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold">!</span>
                          {contextMode.replace('权限', '')} <ChevronDown size={12} />
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
                  {messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col gap-2">
                      {msg.role === 'agent' ? (
                        <>
                          <div className="text-[12px] text-[#888] flex items-center gap-1">
                            已处理 {msg.time} <ChevronRight size={12} />
                          </div>
                          <div className="text-[14px] text-[#333] whitespace-pre-wrap leading-relaxed">
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
                  <div className="bg-white border border-[#e5e5e5] shadow-sm rounded-xl overflow-hidden flex flex-col focus-within:border-codex-blue focus-within:ring-1 focus-within:ring-codex-blue transition-all">
                    <textarea 
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      className="w-full min-h-[60px] max-h-[200px] p-3 text-[14px] outline-none resize-none placeholder-[#aaa]"
                      placeholder="要求后续变更"
                    />
                    <div className="flex items-center justify-between px-3 py-2 bg-[#fafafa] border-t border-[#f0f0f0]">
                      <div className="flex items-center gap-3">
                        <PlusCircle size={16} className="text-[#888] cursor-pointer hover:text-black" />
                        <div className="flex items-center gap-1 text-[12px] font-medium text-[#ff5f56] cursor-pointer hover:opacity-80">
                          <span className="border border-[#ff5f56] rounded-full w-4 h-4 flex items-center justify-center text-[10px]">!</span>
                          完全访问 <ChevronDown size={12} />
                        </div>
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

      {/* Right Sidebar (Only in Chat view for now) */}
      {currentView === 'chat' && (
        <div className="w-[280px] bg-[#fcfcfc] border-l border-[#e5e5e5] flex flex-col shrink-0 p-4 gap-2">
          <div className="flex justify-end mb-2 text-[#888] gap-2">
             <Monitor size={16} />
             <div className="w-4 h-4 border border-[#888] rounded flex items-center justify-center cursor-pointer">
               <div className="w-2 h-2 bg-[#888]"></div>
             </div>
          </div>
          <RightTool icon={CheckSquare} label="审查" shortcut="^⇧G" />
          <RightTool icon={TerminalSquare} label="终端" />
          <RightTool icon={Monitor} label="浏览器" shortcut="⌘T" />
          <RightTool icon={FileText} label="文件" shortcut="⌘P" />
          <RightTool icon={MessageSquare} label="侧边聊天" shortcut="⌥⌘S" />
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

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <div onClick={onClick} className={`px-3 py-1.5 flex items-center gap-2 text-[13px] rounded-lg cursor-pointer ${active ? 'bg-[#e3e3e3] text-black font-medium' : 'text-[#555] hover:bg-[#ebebeb]'}`}>
    <Icon size={16} className={active ? "text-black shrink-0" : "text-[#888] shrink-0"} />
    <span className="truncate">{label}</span>
  </div>
);

const SidebarSection = ({ title }: { title: string }) => (
  <div className="px-3 pt-3 pb-1 flex items-center gap-1 text-[11px] font-semibold text-[#888]">
    {title && <ChevronDown size={12} />}
    {title}
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

const RightTool = ({ icon: Icon, label, shortcut }: any) => (
  <div className="flex items-center justify-between px-3 py-2 bg-[#f5f5f5] hover:bg-[#ebebeb] rounded-lg cursor-pointer border border-[#e5e5e5] transition-colors">
    <div className="flex items-center gap-2 text-[13px] text-[#555]">
      <Icon size={16} className="text-[#888]" />
      <span>{label}</span>
    </div>
    {shortcut && <div className="text-[11px] text-[#888] bg-[#ebebeb] px-1.5 rounded font-mono border border-[#ddd]">{shortcut}</div>}
  </div>
);

