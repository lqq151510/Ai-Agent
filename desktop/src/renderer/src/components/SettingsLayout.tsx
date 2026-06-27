import { useState, useEffect, useMemo } from 'react';
import { Settings, User, Sun, Sliders, Palette, Keyboard, Activity, Link, LayoutGrid, Globe, MousePointer2, GitBranch, TerminalSquare, Archive, ArrowLeft, Search, Plus, RefreshCw, Folder, Check, Trash2, AlertCircle } from 'lucide-react';

const SidebarItem = ({ icon: Icon, label, active = false, onClick }: { icon: React.ElementType, label: string, active?: boolean, onClick: () => void }) => (
  <div onClick={onClick} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg cursor-pointer text-[13px] ${active ? 'bg-[#e8e8e8] text-black font-semibold' : 'text-[#555] hover:bg-[#ebebeb]'}`}>
    <Icon size={15} strokeWidth={2.2} className={active ? "text-black" : "text-[#666]"} />
    <span>{label}</span>
  </div>
);

const SidebarSection = ({ title }: { title: string }) => (
  <div className="px-3 pt-3.5 pb-1 text-[11px] font-bold text-[#888] tracking-wider uppercase select-none">
    {title}
  </div>
);

type ThreadSummary = {
  id: string;
  name?: string;
  status?: string;
  projectPath?: string;
  branch?: string;
};

type ArchivedSessionSummary = {
  id: string;
  title?: string;
  branch?: string;
  updatedAt: number | string;
};

type ArchivedConversation = {
  id: string;
  title: string;
  time: string;
};

type ArchivedConversationGroup = {
  project: string;
  count: number;
  conversations: ArchivedConversation[];
};

const toSessionTimestamp = (value: number | string) => {
  if (typeof value === 'number') {
    return value;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const SettingsLayout = ({ onBack, initialTab = '常规', workspacePath }: { onBack: () => void; initialTab?: string; workspacePath?: string | null }) => {
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  const [activeTab, setActiveTab] = useState(initialTab);

  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    setActiveTab(initialTab);
  }

  const renderContent = () => {
    switch (activeTab) {
      case '常规':
        return <GeneralTab />;
      case '个人资料':
        return <ProfileTab />;
      case '外观':
        return <AppearanceTab />;
      case '配置':
        return <ConfigTab />;
      case '个性化':
        return <PersonalizationTab />;
      case 'MCP 服务器':
        return <MCPServersTab />;
      case '浏览器':
        return <BrowserTab />;
      case '钩子':
        return <HooksTab />;
      case '连接':
        return <ConnectionsTab />;
      case '工作树':
        return <WorktreeTab />;
      case '已归档对话':
        return <ArchivedConversationsTab />;
      case '环境':
        return <EnvironmentTab workspacePath={workspacePath} />;
      default:
        return <PlaceholderTab name={activeTab} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[#1a1a1a] font-sans select-text">
      {/* Left Sidebar */}
      <div className="w-[240px] bg-[#f5f5f5] border-r border-[#e5e5e5] flex flex-col shrink-0">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[#555] hover:text-black cursor-pointer text-[13px] font-medium pt-2" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>返回应用</span>
          </div>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-2.5 top-2.5 text-[#888]" />
            <input 
              type="text" 
              placeholder="搜索设置..." 
              className="w-full bg-white border border-[#ddd] rounded-md py-1.5 pl-8 pr-3 text-[13px] outline-none focus:border-codex-blue transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-0.5">
          <SidebarSection title="个人" />
          <SidebarItem icon={Settings} label="常规" active={activeTab === '常规'} onClick={() => setActiveTab('常规')} />
          <SidebarItem icon={User} label="个人资料" active={activeTab === '个人资料'} onClick={() => setActiveTab('个人资料')} />
          <SidebarItem icon={Sun} label="外观" active={activeTab === '外观'} onClick={() => setActiveTab('外观')} />
          <SidebarItem icon={Sliders} label="配置" active={activeTab === '配置'} onClick={() => setActiveTab('配置')} />
          <SidebarItem icon={Palette} label="个性化" active={activeTab === '个性化'} onClick={() => setActiveTab('个性化')} />
          <SidebarItem icon={Keyboard} label="键盘快捷键" active={activeTab === '键盘快捷键'} onClick={() => setActiveTab('键盘快捷键')} />
          <SidebarItem icon={Activity} label="使用情况和计费" active={activeTab === '使用情况和计费'} onClick={() => setActiveTab('使用情况和计费')} />

          <SidebarSection title="集成" />
          <SidebarItem icon={LayoutGrid} label="应用快照" active={activeTab === '应用快照'} onClick={() => setActiveTab('应用快照')} />
          <SidebarItem icon={Link} label="MCP 服务器" active={activeTab === 'MCP 服务器'} onClick={() => setActiveTab('MCP 服务器')} />
          <SidebarItem icon={Globe} label="浏览器" active={activeTab === '浏览器'} onClick={() => setActiveTab('浏览器')} />
          <SidebarItem icon={MousePointer2} label="电脑操控" active={activeTab === '电脑操控'} onClick={() => setActiveTab('电脑操控')} />

          <SidebarSection title="编码" />
          <SidebarItem icon={TerminalSquare} label="钩子" active={activeTab === '钩子'} onClick={() => setActiveTab('钩子')} />
          <SidebarItem icon={Link} label="连接" active={activeTab === '连接'} onClick={() => setActiveTab('连接')} />
          <SidebarItem icon={GitBranch} label="Git" active={activeTab === 'Git'} onClick={() => setActiveTab('Git')} />
          <SidebarItem icon={TerminalSquare} label="环境" active={activeTab === '环境'} onClick={() => setActiveTab('环境')} />
          <SidebarItem icon={Archive} label="工作树" active={activeTab === '工作树'} onClick={() => setActiveTab('工作树')} />

          <SidebarSection title="已归档" />
          <SidebarItem icon={Archive} label="已归档对话" active={activeTab === '已归档对话'} onClick={() => setActiveTab('已归档对话')} />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-[720px] mx-auto py-10 px-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

const EnvironmentTab = ({ workspacePath }: { workspacePath?: string | null }) => {
  const [localPort, setLocalPort] = useState<number | null>(null);
  const [localReady, setLocalReady] = useState<boolean>(false);

  useEffect(() => {
    const fetchLocalServiceInfo = async () => {
      if (window.electronAPI?.localService) {
        try {
          const port = await window.electronAPI.localService.port();
          const ready = await window.electronAPI.localService.isReady();
          setLocalPort(port);
          setLocalReady(ready);
        } catch (err) {
          console.error('Failed to get local-service info:', err);
        }
      }
    };
    void fetchLocalServiceInfo();
  }, []);

  const platformInfo = navigator.userAgent;
  const isMac = platformInfo.includes('Mac');

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12">
      <div className="border-b border-[#eee] pb-3.5 mb-2">
        <h2 className="text-[20px] font-bold text-black">环境诊断</h2>
        <div className="text-[12px] text-[#57606a] mt-1">
          查看客户端与后端微服务组件的运行端口、通信状态及核心系统环境。
        </div>
      </div>

      {/* 核心诊断卡片 */}
      <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm divide-y divide-[#eee]">
        {/* 客户端版本 */}
        <div className="p-4 flex justify-between items-center">
          <div>
            <div className="text-[13px] font-semibold text-black">客户端版本</div>
            <div className="text-[11px] text-[#57606a] mt-0.5">当前 Electron Desktop App 的版本信息</div>
          </div>
          <span className="font-mono text-[12px] bg-[#eff1f3] px-2.5 py-1 rounded font-bold text-black">v0.1.0 (Dev)</span>
        </div>

        {/* 工作区目录 */}
        <div className="p-4 flex justify-between items-center">
          <div className="min-w-0 pr-4 flex-1">
            <div className="text-[13px] font-semibold text-black">活动工作区</div>
            <div className="text-[11px] text-[#57606a] mt-0.5">当前已挂载的项目根目录绝对路径</div>
          </div>
          <span className="font-mono text-[11px] bg-[#eff1f3] px-2.5 py-1 rounded text-black truncate max-w-xs block font-bold" title={workspacePath || '未挂载工作区'}>
            {workspacePath || '未挂载工作区'}
          </span>
        </div>

        {/* Java 后端服务 */}
        <div className="p-4 flex justify-between items-center">
          <div>
            <div className="text-[13px] font-semibold text-black">Java Spring Boot 核心微服务</div>
            <div className="text-[11px] text-[#57606a] mt-0.5">AI-Agent 的后端逻辑与编排服务</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
            <span className="font-mono text-[12px] text-black font-bold">Port: 18080 (Active)</span>
          </div>
        </div>

        {/* 本地工具链服务 */}
        <div className="p-4 flex justify-between items-center">
          <div>
            <div className="text-[13px] font-semibold text-black">本地工具链服务 (Local Service)</div>
            <div className="text-[11px] text-[#57606a] mt-0.5">负责执行本地终端、文件及环境审查的 Node.js 辅助服务</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${localReady ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="font-mono text-[12px] text-black font-bold">
              {localPort ? `Port: ${localPort} (${localReady ? 'Active' : 'Error'})` : '检测中...'}
            </span>
          </div>
        </div>

        {/* 运行平台环境 */}
        <div className="p-4 flex justify-between items-center">
          <div>
            <div className="text-[13px] font-semibold text-black">宿主系统平台</div>
            <div className="text-[11px] text-[#57606a] mt-0.5">客户端所运行的操作系统架构</div>
          </div>
          <span className="font-mono text-[12px] bg-[#eff1f3] px-2.5 py-1 rounded text-black font-bold uppercase">
            {isMac ? 'macOS (Darwin)' : 'Windows / Linux'}
          </span>
        </div>
      </div>
    </div>
  );
};

// ================= TABS =================

const PlaceholderTab = ({ name }: { name: string }) => (
  <div className="py-16 text-center">
    <h2 className="text-[20px] font-semibold mb-2 text-black">{name}</h2>
    <p className="text-[13px] text-[#666]">该设置项正在设计对接中，敬请期待。</p>
  </div>
);

// Toggle Component
const Toggle = ({ checked, onChange }: { checked: boolean; onChange?: () => void }) => (
  <div 
    onClick={onChange}
    className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${checked ? 'bg-[#007aff]' : 'bg-[#e5e5e5]'}`}
  >
    <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`}></div>
  </div>
);

const GeneralTab = () => {
  const [workMode, setWorkMode] = useState('programming'); // programming, daily
  const [defaultPerm, setDefaultPerm] = useState(true);
  const [autoAudit, setAutoAudit] = useState(true);
  const [fullAccess, setFullAccess] = useState(true);
  const [openTarget, setOpenTarget] = useState('VS Code');
  const [language, setLanguage] = useState('中文 (中国)');
  const [showInMenu, setShowInMenu] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [terminalPos, setTerminalPos] = useState('底部'); // 底部, 右侧
  const [preventSleep, setPreventSleep] = useState(true);
  const [inferenceSpeed, setInferenceSpeed] = useState('标准');
  const [codeReviewMode, setCodeReviewMode] = useState('分离视图'); // 行内视图, 分离视图
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [contextWindow, setContextWindow] = useState(true);
  const [followupBehavior, setFollowupBehavior] = useState('排队'); // 排队, 引导
  const [cmdEnterLong, setCmdEnterLong] = useState(false);
  const [defaultNoProject, setDefaultNoProject] = useState(false);
  const [microphone, setMicrophone] = useState('System default');
  const [keepDictationBar, setKeepDictationBar] = useState(false);
  const [dictationDictionary, setDictationDictionary] = useState('带有超');
  const [roundNotify, setRoundNotify] = useState('仅当应用失去焦点时');
  const [permNotify, setPermNotify] = useState(true);
  const [issueNotify, setIssueNotify] = useState(true);

  return (
    <div className="space-y-8 pr-2 pb-12 select-none">
      <h2 className="text-[20px] font-bold text-black border-b border-[#eee] pb-3 mb-6">常规</h2>

      {/* 工作模式 */}
      <div>
        <h3 className="text-[14px] font-semibold text-[#1f2328] mb-1">工作模式</h3>
        <div className="text-[12px] text-[#57606a] mb-3">选择 Codex 显示多少技术细节</div>
        <div className="grid grid-cols-2 gap-4">
          <div 
            onClick={() => setWorkMode('programming')}
            className={`border rounded-xl p-4 flex justify-between items-center cursor-pointer transition-all ${workMode === 'programming' ? 'border-[#007aff] bg-[#f4f9ff]' : 'border-[#e5e5e5] bg-white hover:bg-[#fafafa]'}`}
          >
            <div className="flex items-start gap-3">
              <TerminalSquare className={workMode === 'programming' ? 'text-[#007aff] mt-0.5' : 'text-[#57606a] mt-0.5'} size={18} />
              <div>
                <div className={`font-medium text-[14px] ${workMode === 'programming' ? 'text-black font-semibold' : 'text-[#1f2328]'}`}>适用于编程</div>
                <div className="text-[12px] text-[#57606a] mt-0.5">更具技术性的回复 and 控制</div>
              </div>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${workMode === 'programming' ? 'border-[#007aff]' : 'border-[#ccc]'}`}>
              {workMode === 'programming' && <div className="w-2 h-2 rounded-full bg-[#007aff]" />}
            </div>
          </div>
          
          <div 
            onClick={() => setWorkMode('daily')}
            className={`border rounded-xl p-4 flex justify-between items-center cursor-pointer transition-all ${workMode === 'daily' ? 'border-[#007aff] bg-[#f4f9ff]' : 'border-[#e5e5e5] bg-white hover:bg-[#fafafa]'}`}
          >
            <div className="flex items-start gap-3">
              <Activity className={workMode === 'daily' ? 'text-[#007aff] mt-0.5' : 'text-[#57606a] mt-0.5'} size={18} />
              <div>
                <div className={`font-medium text-[14px] ${workMode === 'daily' ? 'text-black font-semibold' : 'text-[#1f2328]'}`}>适用于日常工作</div>
                <div className="text-[12px] text-[#57606a] mt-0.5">同样强大，技术细节更少</div>
              </div>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${workMode === 'daily' ? 'border-[#007aff]' : 'border-[#ccc]'}`}>
              {workMode === 'daily' && <div className="w-2 h-2 rounded-full bg-[#007aff]" />}
            </div>
          </div>
        </div>
      </div>

      {/* 权限 */}
      <div>
        <h3 className="text-[14px] font-semibold text-[#1f2328] mb-3">权限</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div className="pr-8">
              <div className="text-[14px] font-medium mb-1 text-black">默认权限</div>
              <div className="text-[12px] text-[#57606a] leading-relaxed">默认情况下，Codex 可以读取并编辑其工作区中的文件。必要时，它可以请求额外的访问权限。</div>
            </div>
            <Toggle checked={defaultPerm} onChange={() => setDefaultPerm(v => !v)} />
          </div>
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div className="pr-8">
              <div className="text-[14px] font-medium mb-1 text-black">自动审核</div>
              <div className="text-[12px] text-[#57606a] leading-relaxed">Codex 可以读取并编辑其工作区中的文件。Codex 会自动审核额外访问权限请求。<a href="#" className="text-[#007aff] hover:underline">了解更多</a>有关高风险的信息。</div>
            </div>
            <Toggle checked={autoAudit} onChange={() => setAutoAudit(v => !v)} />
          </div>
          <div className="p-4 flex justify-between items-center">
            <div className="pr-8">
              <div className="text-[14px] font-medium mb-1 text-black">完全访问权限</div>
              <div className="text-[12px] text-[#57606a] leading-relaxed">当 Codex 以完全访问权限运行时，无需你批准，即可编辑你的电脑上的任何文件并运行联网命令。这会显著增加数据丢失、泄露或意外行为的风险。<a href="#" className="text-[#007aff] hover:underline">了解更多</a>有关高风险的信息。</div>
            </div>
            <Toggle checked={fullAccess} onChange={() => setFullAccess(v => !v)} />
          </div>
        </div>
      </div>

      {/* 常规 */}
      <div>
        <h3 className="text-[14px] font-semibold text-[#1f2328] mb-3">常规</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          {/* 默认打开目标 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">默认打开目标</div>
              <div className="text-[12px] text-[#57606a]">默认打开文件和文件夹的位置</div>
            </div>
            <select 
              value={openTarget}
              onChange={e => setOpenTarget(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[140px] cursor-pointer"
            >
              <option>VS Code</option>
              <option>Cursor</option>
              <option>Terminal</option>
              <option>Finder</option>
            </select>
          </div>
          {/* 语言 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">语言</div>
              <div className="text-[12px] text-[#57606a]">应用 UI 语言</div>
            </div>
            <select 
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[140px] cursor-pointer"
            >
              <option>中文 (中国)</option>
              <option>English (US)</option>
            </select>
          </div>
          {/* 在菜单栏中显示 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">在菜单栏中显示</div>
              <div className="text-[12px] text-[#57606a]">关闭主窗口后，仍在 macOS 菜单栏中保留 Codex</div>
            </div>
            <Toggle checked={showInMenu} onChange={() => setShowInMenu(v => !v)} />
          </div>
          {/* 底部面板 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">底部面板</div>
              <div className="text-[12px] text-[#57606a]">在应用标题栏中显示底部面板控件</div>
            </div>
            <Toggle checked={showBottomPanel} onChange={() => setShowBottomPanel(v => !v)} />
          </div>
          {/* 默认终端位置 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">默认终端位置</div>
              <div className="text-[12px] text-[#57606a]">选择终端快捷键和环境操作在何处打开终端标签页</div>
            </div>
            <div className="flex bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg p-0.5">
              <button 
                onClick={() => setTerminalPos('底部')}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${terminalPos === '底部' ? 'bg-white shadow-sm text-black font-semibold' : 'text-[#57606a] hover:text-black'}`}
              >
                底部
              </button>
              <button 
                onClick={() => setTerminalPos('右侧')}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${terminalPos === '右侧' ? 'bg-white shadow-sm text-black font-semibold' : 'text-[#57606a] hover:text-black'}`}
              >
                右侧
              </button>
            </div>
          </div>
          {/* 运行时防止休眠 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">运行时防止休眠</div>
              <div className="text-[12px] text-[#57606a]">在 Codex 运行对话时，让电脑保持唤醒状态</div>
            </div>
            <Toggle checked={preventSleep} onChange={() => setPreventSleep(v => !v)} />
          </div>
          {/* 速度 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">速度</div>
              <div className="text-[12px] text-[#57606a]">选择用于聊天、子智能体和压缩的推理层级</div>
            </div>
            <select 
              value={inferenceSpeed}
              onChange={e => setInferenceSpeed(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[140px] cursor-pointer"
            >
              <option>标准</option>
              <option>快速</option>
              <option>深度思考</option>
            </select>
          </div>
          {/* 代码审查 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">代码审查</div>
              <div className="text-[12px] text-[#57606a]">尽可能在当前对话中启动 /review，或发起单独的审查对话</div>
            </div>
            <div className="flex bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg p-0.5">
              <button 
                onClick={() => setCodeReviewMode('行内视图')}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${codeReviewMode === '行内视图' ? 'bg-white shadow-sm text-black font-semibold' : 'text-[#57606a] hover:text-black'}`}
              >
                行内视图
              </button>
              <button 
                onClick={() => setCodeReviewMode('分离视图')}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${codeReviewMode === '分离视图' ? 'bg-white shadow-sm text-black font-semibold' : 'text-[#57606a] hover:text-black'}`}
              >
                分离视图
              </button>
            </div>
          </div>
          {/* 建议提示 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">建议提示</div>
              <div className="text-[12px] text-[#57606a]">搜索项目文件和已连接应用，建议下一步操作</div>
            </div>
            <Toggle checked={showSuggestions} onChange={() => setShowSuggestions(v => !v)} />
          </div>
          {/* 导入的智能体设置 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">导入的智能体设置</div>
              <div className="text-[12px] text-[#57606a]">上次于 2 天 前导入</div>
            </div>
            <button className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[13px] font-semibold text-black shrink-0 transition-colors">
              再次导入
            </button>
          </div>
          {/* 打开开源许可证 */}
          <div className="p-4 flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">打开开源许可证</div>
              <div className="text-[12px] text-[#57606a]">捆绑依赖项的第三方声明</div>
            </div>
            <button className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[13px] font-semibold text-black shrink-0 transition-colors">
              查看
            </button>
          </div>
        </div>
      </div>

      {/* 编辑器 */}
      <div>
        <h3 className="text-[14px] font-semibold text-[#1f2328] mb-3">编辑器</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          {/* 显示上下文窗口使用情况 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">显示上下文窗口使用情况</div>
              <div className="text-[12px] text-[#57606a]">在应用中直观展示上下文 Token 占用百分比</div>
            </div>
            <Toggle checked={contextWindow} onChange={() => setContextWindow(v => !v)} />
          </div>
          {/* 跟进行为 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div className="pr-4">
              <div className="text-[14px] font-medium mb-1 text-black">跟进行为</div>
              <div className="text-[12px] text-[#57606a] pr-4 leading-relaxed">在 Codex 运行时将后续操作加入队列，或引导当前运行。按下“⌘+↵”可对单条消息执行相反操作</div>
            </div>
            <div className="flex bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg p-0.5 shrink-0">
              <button 
                onClick={() => setFollowupBehavior('排队')}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${followupBehavior === '排队' ? 'bg-white shadow-sm text-black font-semibold' : 'text-[#57606a] hover:text-black'}`}
              >
                排队
              </button>
              <button 
                onClick={() => setFollowupBehavior('引导')}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${followupBehavior === '引导' ? 'bg-white shadow-sm text-black font-semibold' : 'text-[#57606a] hover:text-black'}`}
              >
                引导
              </button>
            </div>
          </div>
          {/* 需按 ⌘ + 回车键发送长文本提示 */}
          <div className="p-4 flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">需按 ⌘ + 回车键发送长文本提示</div>
              <div className="text-[12px] text-[#57606a]">启用后，多行提示需按 ⌘ + Enter 才能发送</div>
            </div>
            <Toggle checked={cmdEnterLong} onChange={() => setCmdEnterLong(v => !v)} />
          </div>
        </div>
      </div>

      {/* 弹出窗口 */}
      <div>
        <h3 className="text-[14px] font-semibold text-[#1f2328] mb-3">弹出窗口</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          {/* 全局快捷键 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">弹出窗口快捷键</div>
              <div className="text-[12px] text-[#57606a]">为弹出窗口设置全局快捷键。留空则保持关闭。</div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-[12px] text-[#888]">禁用</span>
              <button className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[13px] font-semibold text-black transition-colors">
                设置
              </button>
            </div>
          </div>
          {/* 默认使用无项目聊天 */}
          <div className="p-4 flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">默认使用无项目聊天</div>
              <div className="text-[12px] text-[#57606a]">无需项目即可开始新聊天</div>
            </div>
            <Toggle checked={defaultNoProject} onChange={() => setDefaultNoProject(v => !v)} />
          </div>
        </div>
      </div>

      {/* 听写 */}
      <div>
        <h3 className="text-[14px] font-semibold text-[#1f2328] mb-3">听写</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          {/* Microphone */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">Microphone</div>
              <div className="text-[12px] text-[#57606a]">Used for dictation</div>
            </div>
            <select 
              value={microphone}
              onChange={e => setMicrophone(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[160px] cursor-pointer"
            >
              <option>System default</option>
              <option>Built-in Microphone</option>
            </select>
          </div>
          {/* 按住听写快捷键 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">按住听写快捷键</div>
              <div className="text-[12px] text-[#57606a]">在桌面任意位置按住，即可在光标处听写</div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-[12px] text-[#888]">关闭</span>
              <button className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[13px] font-semibold text-black transition-colors">
                设置
              </button>
            </div>
          </div>
          {/* 切换听写快捷键 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">切换听写快捷键</div>
              <div className="text-[12px] text-[#57606a]">在桌面任意位置按一次开始听写，再按一次停止</div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-[12px] text-[#888]">关闭</span>
              <button className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[13px] font-semibold text-black transition-colors">
                设置
              </button>
            </div>
          </div>
          {/* 保持听写栏可见 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">保持听写栏可见</div>
              <div className="text-[12px] text-[#57606a]">听写未录制时显示小型快捷键提醒</div>
            </div>
            <Toggle checked={keepDictationBar} onChange={() => setKeepDictationBar(v => !v)} />
          </div>
          {/* 听写词典 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">听写词典</div>
              <div className="text-[12px] text-[#57606a]">听写应能识别的单词或短语</div>
            </div>
            <select 
              value={dictationDictionary}
              onChange={e => setDictationDictionary(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[140px] cursor-pointer"
            >
              <option>带有超</option>
              <option>日常对话</option>
              <option>编程术语</option>
            </select>
          </div>
          {/* Bottom dictation snippet */}
          <div className="p-3.5 bg-[#fafafa] flex justify-between items-center text-[12px] text-[#666] font-mono px-4 border-t border-[#f0f0f0]">
            <span>6月17日 15:12</span>
            <div className="flex items-center gap-2 cursor-pointer hover:text-black text-black font-semibold">
              <span>带有超</span>
              <span className="text-[13px]">📋</span>
            </div>
          </div>
        </div>
      </div>

      {/* 通知 */}
      <div>
        <h3 className="text-[14px] font-semibold text-[#1f2328] mb-3">通知</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          {/* 轮次完成通知 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">轮次完成通知</div>
              <div className="text-[12px] text-[#57606a]">设置 Codex 完成任务时的提醒</div>
            </div>
            <select 
              value={roundNotify}
              onChange={e => setRoundNotify(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[160px] cursor-pointer"
            >
              <option>仅当应用失去焦点时</option>
              <option>始终通知</option>
              <option>从不通知</option>
            </select>
          </div>
          {/* 启用权限通知 */}
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">启用权限通知</div>
              <div className="text-[12px] text-[#57606a]">在需要通知权限时显示提醒</div>
            </div>
            <Toggle checked={permNotify} onChange={() => setPermNotify(v => !v)} />
          </div>
          {/* 启用问题通知 */}
          <div className="p-4 flex justify-between items-center">
            <div>
              <div className="text-[14px] font-medium mb-1 text-black">启用问题通知</div>
              <div className="text-[12px] text-[#57606a]">需要输入才能继续时显示提醒</div>
            </div>
            <Toggle checked={issueNotify} onChange={() => setIssueNotify(v => !v)} />
          </div>
        </div>
      </div>
    </div>
  );
};

const INITIAL_ACTIVITY_DATA = Array.from({ length: 7 * 24 }, (_, i) => {
  const col = Math.floor(i / 7);
  if (col >= 21) {
    // Last 3 columns representing June (highly active in the screenshot)
    const rand = Math.random();
    return rand > 0.6 ? 'bg-[#007aff]' : rand > 0.25 ? 'bg-[#54a0ff]' : 'bg-[#c7dfff]';
  } else {
    // Past months mostly empty with sparse activity
    return Math.random() > 0.96 ? 'bg-[#c7dfff]' : 'bg-[#ebedf0]';
  }
});

const ProfileTab = () => {
  const activityData = INITIAL_ACTIVITY_DATA;

  return (
    <div className="pb-12 text-[#1f2328] select-none">
      {/* Top Header Actions */}
      <div className="flex justify-between items-center mb-8 border-b border-[#eee] pb-4">
        <h2 className="text-[18px] font-bold text-black">个人资料</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-[#f5f5f5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[12px] font-semibold text-black transition-colors">
            <span>📤</span> 分享
          </button>
          <button className="flex items-center gap-1.5 bg-[#f5f5f5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[12px] font-semibold text-black transition-colors">
            <span>🔒</span> 私有
          </button>
          <button className="flex items-center gap-1.5 bg-[#f5f5f5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[12px] font-semibold text-black transition-colors">
            <span>✏️</span> 编辑
          </button>
        </div>
      </div>

      {/* Monk Avatar and User Identifier */}
      <div className="flex flex-col items-center justify-center mb-8">
        <div className="w-[84px] h-[84px] rounded-full overflow-hidden border border-[#d5d5d5] p-[1.5px] bg-white shadow-sm mb-3">
          <img 
            src="/src/assets/avatar.png" 
            alt="avatar" 
            className="w-full h-full rounded-full object-cover" 
            onError={(e) => { 
              e.currentTarget.src = "https://api.dicebear.com/7.x/bottts/svg?seed=zeshenchuanshuo"; 
            }} 
          />
        </div>
        <h1 className="text-[20px] font-bold text-black">刘勇泽</h1>
        <div className="text-[13px] text-[#57606a] mt-1 flex items-center gap-2 font-medium">
          <span>@zeshenchuanshuo</span>
          <span className="bg-[#f0f0f0] text-[#666] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider scale-90">Plus</span>
        </div>
      </div>

      {/* Five-card stats indicator */}
      <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 shadow-sm grid grid-cols-5 gap-2 text-center mb-8">
        <div className="border-r border-[#f0f0f0] last:border-r-0 py-1">
          <div className="text-[15px] font-bold text-black">3.9亿</div>
          <div className="text-[10px] text-[#57606a] mt-1 font-medium">累计 Token 数</div>
        </div>
        <div className="border-r border-[#f0f0f0] last:border-r-0 py-1">
          <div className="text-[15px] font-bold text-black">8791.6万</div>
          <div className="text-[10px] text-[#57606a] mt-1 font-medium">峰值 Token 数</div>
        </div>
        <div className="border-r border-[#f0f0f0] last:border-r-0 py-1">
          <div className="text-[15px] font-bold text-black">22分 24秒</div>
          <div className="text-[10px] text-[#57606a] mt-1 font-medium">最长任务时长</div>
        </div>
        <div className="border-r border-[#f0f0f0] last:border-r-0 py-1">
          <div className="text-[15px] font-bold text-black">16 天</div>
          <div className="text-[10px] text-[#57606a] mt-1 font-medium">当前连续天数</div>
        </div>
        <div className="py-1">
          <div className="text-[15px] font-bold text-black">16 天</div>
          <div className="text-[10px] text-[#57606a] mt-1 font-medium">最长连续天数</div>
        </div>
      </div>

      {/* GitHub heat-map style contribution block */}
      <div className="mb-8 bg-white border border-[#e5e5e5] rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[14px] font-semibold text-black">Token 活动</h3>
          <div className="flex items-center gap-3 text-[11px] text-[#57606a] font-medium">
            <span className="font-bold text-[#007aff] cursor-pointer">每日</span>
            <span className="hover:text-black cursor-pointer">每周</span>
            <span className="hover:text-black cursor-pointer">累计</span>
          </div>
        </div>
        
        {/* Heat Map grid */}
        <div className="flex flex-col gap-1.5 overflow-x-auto select-none">
          {/* Months */}
          <div className="flex justify-between text-[10px] text-[#888] pr-2 pl-6" style={{ minWidth: '450px' }}>
            <span>7月</span>
            <span>8月</span>
            <span>9月</span>
            <span>10月</span>
            <span>11月</span>
            <span>12月</span>
            <span>1月</span>
            <span>2月</span>
            <span>3月</span>
            <span>4月</span>
            <span>5月</span>
            <span>6月</span>
          </div>
          {/* Rows & Weekdays indicators */}
          <div className="flex gap-1.5" style={{ minWidth: '450px' }}>
            <div className="flex flex-col justify-between text-[9px] text-[#aaa] w-4 pr-1 pt-1 shrink-0">
              <span>一</span>
              <span>三</span>
              <span>五</span>
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-[3.5px] flex-1">
              {activityData.map((bgColor, idx) => (
                <div 
                  key={idx} 
                  className={`w-[10px] h-[10px] rounded-[1.5px] ${bgColor} transition-all hover:scale-110 hover:ring-1 hover:ring-[#007aff] cursor-pointer`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Two columns Details info */}
      <div className="grid grid-cols-2 gap-6">
        {/* 活动洞察 */}
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-5 shadow-sm">
          <h3 className="text-[14px] font-semibold text-black mb-4 border-b border-[#f3f3f3] pb-2">活动洞察</h3>
          <div className="space-y-3.5 text-[13px] font-medium">
            <div className="flex justify-between">
              <span className="text-[#57606a]">快速模式</span>
              <span className="text-black font-semibold">1%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#57606a]">最常用的推理强度</span>
              <span className="text-black font-semibold">低 - 30%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#57606a]">已探索的技能</span>
              <span className="text-black font-semibold">45</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#57606a]">使用的技能总数</span>
              <span className="text-black font-semibold">140</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#57606a]">会话总数</span>
              <span className="text-black font-semibold">264</span>
            </div>
          </div>
        </div>

        {/* 最常用的插件 */}
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-5 shadow-sm">
          <h3 className="text-[14px] font-semibold text-[#1f2328] mb-4 border-b border-[#f3f3f3] pb-2">最常用的插件</h3>
          <div className="space-y-3.5 text-[13px] font-semibold font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[#007aff]">$audit-context-building</span>
              <span className="text-[#57606a] font-sans font-medium text-[12px]">21 次运行</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#bf5af2]">@frontend-design</span>
              <span className="text-[#57606a] font-sans font-medium text-[12px]">9 次运行</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#ff9f0a]">$brainstorming</span>
              <span className="text-[#57606a] font-sans font-medium text-[12px]">9 次运行</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#30d158]">$ui-ux-pro-max</span>
              <span className="text-[#57606a] font-sans font-medium text-[12px]">9 次运行</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#ff453a]">@codex-security</span>
              <span className="text-[#57606a] font-sans font-medium text-[12px]">8 次运行</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const isLight = (hexColor: string) => {
  const c = hexColor.substring(1);
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 180;
};

const ColorPill = ({ color, label, onChange }: { color: string; label: string; onChange: (val: string) => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempColor, setTempColor] = useState(color);

  return (
    <div className="flex justify-between items-center border-b border-[#eee] py-3.5">
      <span className="text-[13px] font-semibold text-black">{label}</span>
      {isEditing ? (
        <div className="flex items-center gap-1.5">
          <input 
            type="text" 
            value={tempColor}
            onChange={e => setTempColor(e.target.value)}
            className="bg-[#f5f5f5] border border-[#e5e5e5] rounded px-2 py-1 text-[12px] font-mono w-24 outline-none focus:border-[#007aff]"
          />
          <button 
            onClick={() => {
              if (tempColor.match(/^#[0-9A-Fa-f]{6}$/)) {
                onChange(tempColor.toUpperCase());
                setIsEditing(false);
              } else {
                alert('请输入合法的 HEX 颜色，例如 #FFFFFF');
              }
            }}
            className="bg-[#007aff] text-white px-2.5 py-1 rounded text-[11px] font-semibold"
          >
            确定
          </button>
          <button 
            onClick={() => {
              setTempColor(color);
              setIsEditing(false);
            }}
            className="bg-[#f5f5f5] border border-[#e5e5e5] px-2.5 py-1 rounded text-[11px] text-black font-semibold"
          >
            取消
          </button>
        </div>
      ) : (
        <div 
          onClick={() => setIsEditing(true)}
          style={{ 
            backgroundColor: color, 
            color: isLight(color) ? '#1a1c1f' : '#ffffff',
            border: color.toUpperCase() === '#FFFFFF' ? '1px solid #ddd' : 'none'
          }}
          className="px-3 py-1 rounded-full text-[12px] font-mono font-bold flex items-center gap-2 cursor-pointer shadow-sm select-none"
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: isLight(color) ? '#bbb' : '#fff', border: '1px solid rgba(0,0,0,0.1)' }} />
          <span>{color.toUpperCase()}</span>
        </div>
      )}
    </div>
  );
};

const AppearanceTab = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('codex_theme') || 'light'); // system, light, dark
  const [lightThemeSelect, setLightThemeSelect] = useState('Codex');
  const [lightAccent, setLightAccent] = useState(() => localStorage.getItem('codex_light_accent') || '#0969da');
  const [lightBg, setLightBg] = useState(() => localStorage.getItem('codex_light_bg') || '#ffffff');
  const [lightFg, setLightFg] = useState(() => localStorage.getItem('codex_light_fg') || '#1f2328');
  const [lightUiFont, setLightUiFont] = useState('-apple-system, Blink');
  const [lightCodeFont, setLightCodeFont] = useState('ui-monospace, "SFM');
  const [lightTransSidebar, setLightTransSidebar] = useState(true);
  const [lightContrast, setLightContrast] = useState(45);

  useEffect(() => {
    localStorage.setItem('codex_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('codex_light_accent', lightAccent);
    localStorage.setItem('codex_light_bg', lightBg);
    localStorage.setItem('codex_light_fg', lightFg);

    document.documentElement.style.setProperty('--color-accent', lightAccent);
    document.documentElement.style.setProperty('--color-bg-secondary', lightBg);
    document.documentElement.style.setProperty('--color-text', lightFg);
  }, [lightAccent, lightBg, lightFg]);

  const [darkThemeSelect, setDarkThemeSelect] = useState('Codex');
  const [darkAccent, setDarkAccent] = useState('#339CFF');
  const [darkBg, setDarkBg] = useState('#181818');
  const [darkFg, setDarkFg] = useState('#FFFFFF');
  const [darkUiFont, setDarkUiFont] = useState('-apple-system, Blink');
  const [darkCodeFont, setDarkCodeFont] = useState('ui-monospace, "SFM');
  const [darkTransSidebar, setDarkTransSidebar] = useState(true);
  const [darkContrast, setDarkContrast] = useState(60);

  const [usePointer, setUsePointer] = useState(true);
  const [reduceMotion, setReduceMotion] = useState('系统'); // 系统, 开启, 关闭
  const [uiFontSize, setUiFontSize] = useState(14);
  const [codeFontSize, setCodeFontSize] = useState(12);
  const [diffMarker, setDiffMarker] = useState('颜色'); // 颜色, +/-
  const [fontSmooth, setFontSmooth] = useState(true);

  const [dockIcon, setDockIcon] = useState('default'); // default, light, dark

  return (
    <div className="space-y-8 pr-2 pb-12 select-none text-[#1f2328]">
      <h2 className="text-[20px] font-bold text-black border-b border-[#eee] pb-3 mb-6">外观</h2>

      {/* Theme Cards selection */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        {/* 系统 */}
        <div 
          onClick={() => setTheme('system')}
          className="flex flex-col items-center cursor-pointer"
        >
          <div 
            className={`w-full aspect-[1.6] rounded-xl overflow-hidden border-2 relative transition-all ${theme === 'system' ? 'border-[#007aff] shadow-md ring-2 ring-[#007aff]/10' : 'border-[#e5e5e5] hover:border-[#ccc]'}`}
          >
            <div className="w-full h-full flex">
              <div className="w-1/2 h-full bg-[#f5f5f5] flex flex-col p-3 gap-2">
                <div className="h-2 w-2/3 bg-[#ddd] rounded"></div>
                <div className="h-4 w-full bg-white rounded border border-[#eee]"></div>
              </div>
              <div className="w-1/2 h-full bg-[#181818] flex flex-col p-3 gap-2">
                <div className="h-2 w-2/3 bg-[#333] rounded"></div>
                <div className="h-4 w-full bg-[#2a2a2a] rounded border border-[#333]"></div>
              </div>
            </div>
          </div>
          <span className="text-[12px] font-semibold text-black mt-2">系统</span>
        </div>

        {/* 浅色 */}
        <div 
          onClick={() => setTheme('light')}
          className="flex flex-col items-center cursor-pointer"
        >
          <div 
            className={`w-full aspect-[1.6] rounded-xl overflow-hidden border-2 relative transition-all ${theme === 'light' ? 'border-[#007aff] shadow-md ring-2 ring-[#007aff]/10' : 'border-[#e5e5e5] hover:border-[#ccc]'}`}
          >
            <div className="w-full h-full bg-[#f5f5f5] flex flex-col p-3 gap-2">
              <div className="h-2 w-1/3 bg-[#ddd] rounded"></div>
              <div className="h-6 w-full bg-white rounded border border-[#eee] shadow-sm"></div>
            </div>
          </div>
          <span className="text-[12px] font-semibold text-black mt-2">浅色</span>
        </div>

        {/* 深色 */}
        <div 
          onClick={() => setTheme('dark')}
          className="flex flex-col items-center cursor-pointer"
        >
          <div 
            className={`w-full aspect-[1.6] rounded-xl overflow-hidden border-2 relative transition-all ${theme === 'dark' ? 'border-[#007aff] shadow-md ring-2 ring-[#007aff]/10' : 'border-[#e5e5e5] hover:border-[#ccc]'}`}
          >
            <div className="w-full h-full bg-[#181818] flex flex-col p-3 gap-2">
              <div className="h-2 w-1/3 bg-[#333] rounded"></div>
              <div className="h-6 w-full bg-[#2a2a2a] rounded border border-[#333]"></div>
            </div>
          </div>
          <span className="text-[12px] font-semibold text-black mt-2">深色</span>
        </div>
      </div>

      {/* Code diff block */}
      <div className="border border-[#e5e5e5] rounded-xl overflow-hidden font-mono text-[12px] bg-white flex shadow-sm mb-6 select-text">
        {/* Left side diff (light config deleted) */}
        <div className="flex-1 border-r border-[#eee] py-3 pr-2 bg-white min-w-0">
          <div className="flex items-start">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">1</span>
            <span className="text-[#333] whitespace-pre"><span className="text-[#005cc5]">const</span> <span className="text-[#6f42c1]">themePreview</span>: ThemeConfig = &#123;</span>
          </div>
          <div className="flex items-start bg-[#ffeef0] border-l-2 border-[#f14c4c]">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">2</span>
            <span className="text-[#333] whitespace-pre">  surface: <span className="text-[#032f62]">"sidebar"</span>,</span>
          </div>
          <div className="flex items-start bg-[#ffeef0] border-l-2 border-[#f14c4c]">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">3</span>
            <span className="text-[#333] whitespace-pre">  accent: <span className="text-[#032f62]">"#2563eb"</span>,</span>
          </div>
          <div className="flex items-start bg-[#ffeef0] border-l-2 border-[#f14c4c]">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">4</span>
            <span className="text-[#333] whitespace-pre">  contrast: <span className="text-[#005cc5]">42</span>,</span>
          </div>
          <div className="flex items-start">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">5</span>
            <span className="text-[#333] whitespace-pre">&#125;;</span>
          </div>
        </div>

        {/* Right side diff (dark config added) */}
        <div className="flex-1 py-3 pr-2 bg-white min-w-0">
          <div className="flex items-start">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">1</span>
            <span className="text-[#333] whitespace-pre"><span className="text-[#005cc5]">const</span> <span className="text-[#6f42c1]">themePreview</span>: ThemeConfig = &#123;</span>
          </div>
          <div className="flex items-start bg-[#e6ffed] border-l-2 border-[#28a745]">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">2</span>
            <span className="text-[#333] whitespace-pre">  surface: <span className="text-[#032f62]">"sidebar-elevated"</span>,</span>
          </div>
          <div className="flex items-start bg-[#e6ffed] border-l-2 border-[#28a745]">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">3</span>
            <span className="text-[#333] whitespace-pre">  accent: <span className="text-[#032f62]">"#00ea5e9"</span>,</span>
          </div>
          <div className="flex items-start bg-[#e6ffed] border-l-2 border-[#28a745]">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">4</span>
            <span className="text-[#333] whitespace-pre">  contrast: <span className="text-[#005cc5]">68</span>,</span>
          </div>
          <div className="flex items-start">
            <span className="text-[#aaa] w-6 shrink-0 text-right select-none text-[10px] pr-2 pt-0.5">5</span>
            <span className="text-[#333] whitespace-pre">&#125;;</span>
          </div>
        </div>
      </div>

      {/* 浅色主题 Section */}
      <div>
        <div className="flex justify-between items-center border-b border-[#eee] pb-2.5 mb-2">
          <h3 className="text-[14px] font-bold text-black">浅色主题</h3>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#007aff] hover:underline cursor-pointer font-semibold">导入</span>
            <span className="text-[12px] text-[#007aff] hover:underline cursor-pointer font-semibold">复制主题</span>
            <div className="flex items-center gap-1.5 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-2 py-1 select-none text-[12px] font-bold text-black scale-95">
              <span className="bg-[#007aff] text-white rounded px-1 scale-90 font-sans text-[10px] font-semibold">Aa</span>
              <select 
                value={lightThemeSelect}
                onChange={e => setLightThemeSelect(e.target.value)}
                className="bg-transparent outline-none cursor-pointer text-black"
              >
                <option>Codex</option>
                <option>Classic</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-xl shadow-sm px-4 overflow-hidden">
          <ColorPill color={lightAccent} label="强调色" onChange={setLightAccent} />
          <ColorPill color={lightBg} label="背景" onChange={setLightBg} />
          <ColorPill color={lightFg} label="前景" onChange={setLightFg} />
          
          <div className="flex justify-between items-center border-b border-[#eee] py-3">
            <span className="text-[13px] font-semibold text-black">UI 字体</span>
            <input 
              type="text" 
              value={lightUiFont}
              onChange={e => setLightUiFont(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[12px] outline-none text-right min-w-[200px] text-[#57606a]"
            />
          </div>

          <div className="flex justify-between items-center border-b border-[#eee] py-3">
            <span className="text-[13px] font-semibold text-black">代码字体</span>
            <input 
              type="text" 
              value={lightCodeFont}
              onChange={e => setLightCodeFont(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[12px] outline-none text-right min-w-[200px] text-[#57606a]"
            />
          </div>

          <div className="flex justify-between items-center border-b border-[#eee] py-3">
            <span className="text-[13px] font-semibold text-black">半透明侧边栏</span>
            <Toggle checked={lightTransSidebar} onChange={() => setLightTransSidebar(v => !v)} />
          </div>

          <div className="flex justify-between items-center py-3">
            <span className="text-[13px] font-semibold text-black">对比度</span>
            <div className="flex items-center gap-3">
              <input 
                type="range"
                min="0"
                max="100"
                value={lightContrast}
                onChange={e => setLightContrast(parseInt(e.target.value))}
                className="w-36 accent-[#007aff] cursor-pointer"
              />
              <span className="text-[12px] font-semibold text-black w-6 text-right">{lightContrast}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 深色主题 Section */}
      <div>
        <div className="flex justify-between items-center border-b border-[#eee] pb-2.5 mb-2">
          <h3 className="text-[14px] font-bold text-black">深色主题</h3>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#007aff] hover:underline cursor-pointer font-semibold">导入</span>
            <span className="text-[12px] text-[#007aff] hover:underline cursor-pointer font-semibold">复制主题</span>
            <div className="flex items-center gap-1.5 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-2 py-1 select-none text-[12px] font-bold text-black scale-95">
              <span className="bg-black text-white rounded px-1 scale-90 font-sans text-[10px] font-semibold">Aa</span>
              <select 
                value={darkThemeSelect}
                onChange={e => setDarkThemeSelect(e.target.value)}
                className="bg-transparent outline-none cursor-pointer text-black"
              >
                <option>Codex</option>
                <option>Classic</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-xl shadow-sm px-4 overflow-hidden">
          <ColorPill color={darkAccent} label="强调色" onChange={setDarkAccent} />
          <ColorPill color={darkBg} label="背景" onChange={setDarkBg} />
          <ColorPill color={darkFg} label="前景" onChange={setDarkFg} />
          
          <div className="flex justify-between items-center border-b border-[#eee] py-3">
            <span className="text-[13px] font-semibold text-black">UI 字体</span>
            <input 
              type="text" 
              value={darkUiFont}
              onChange={e => setDarkUiFont(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[12px] outline-none text-right min-w-[200px] text-[#57606a]"
            />
          </div>

          <div className="flex justify-between items-center border-b border-[#eee] py-3">
            <span className="text-[13px] font-semibold text-black">代码字体</span>
            <input 
              type="text" 
              value={darkCodeFont}
              onChange={e => setDarkCodeFont(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[12px] outline-none text-right min-w-[200px] text-[#57606a]"
            />
          </div>

          <div className="flex justify-between items-center border-b border-[#eee] py-3">
            <span className="text-[13px] font-semibold text-black">半透明侧边栏</span>
            <Toggle checked={darkTransSidebar} onChange={() => setDarkTransSidebar(v => !v)} />
          </div>

          <div className="flex justify-between items-center py-3">
            <span className="text-[13px] font-semibold text-black">对比度</span>
            <div className="flex items-center gap-3">
              <input 
                type="range"
                min="0"
                max="100"
                value={darkContrast}
                onChange={e => setDarkContrast(parseInt(e.target.value))}
                className="w-36 accent-[#007aff] cursor-pointer"
              />
              <span className="text-[12px] font-semibold text-black w-6 text-right">{darkContrast}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Other Parameters (Image 2) */}
      <div className="bg-white border border-[#e5e5e5] rounded-xl shadow-sm px-4 overflow-hidden">
        {/* 使用指针光标 */}
        <div className="flex justify-between items-center border-b border-[#eee] py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-black">使用指针光标</div>
            <div className="text-[12px] text-[#57606a] mt-0.5">悬停交互元素时切换为指针光标</div>
          </div>
          <Toggle checked={usePointer} onChange={() => setUsePointer(v => !v)} />
        </div>

        {/* 减少动态效果 */}
        <div className="flex justify-between items-center border-b border-[#eee] py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-black">减少动态效果</div>
            <div className="text-[12px] text-[#57606a] mt-0.5">减少动画效果或匹配系统设置</div>
          </div>
          <div className="flex bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg p-0.5 scale-95 shrink-0">
            {['系统', '开启', '关闭'].map(option => (
              <button 
                key={option}
                onClick={() => setReduceMotion(option)}
                className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-all ${reduceMotion === option ? 'bg-white shadow-sm text-black' : 'text-[#57606a] hover:text-black'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* UI 字号 */}
        <div className="flex justify-between items-center border-b border-[#eee] py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-black">UI 字号</div>
            <div className="text-[12px] text-[#57606a] mt-0.5">调整 Codex UI 使用的基准字号</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input 
              type="number"
              value={uiFontSize}
              onChange={e => setUiFontSize(parseInt(e.target.value) || 14)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1 text-[13px] outline-none w-16 text-center font-semibold text-black"
            />
            <span className="text-[12px] text-[#888]">px</span>
          </div>
        </div>

        {/* 代码字体大小 */}
        <div className="flex justify-between items-center border-b border-[#eee] py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-black">代码字体大小</div>
            <div className="text-[12px] text-[#57606a] mt-0.5">调整聊天和差异视图中代码使用的基础字号</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input 
              type="number"
              value={codeFontSize}
              onChange={e => setCodeFontSize(parseInt(e.target.value) || 12)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1 text-[13px] outline-none w-16 text-center font-semibold text-black"
            />
            <span className="text-[12px] text-[#888]">px</span>
          </div>
        </div>

        {/* 差异标记 */}
        <div className="flex justify-between items-center border-b border-[#eee] py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-black">差异标记</div>
            <div className="text-[12px] text-[#57606a] mt-0.5">使用彩色条和背景，或在每个更改上显示 “+” 和 “-” 符号</div>
          </div>
          <div className="flex bg-[#f5f5f5] border border-[#e5e5e5] rounded-lg p-0.5 scale-95 shrink-0">
            {['颜色', '+/-'].map(option => (
              <button 
                key={option}
                onClick={() => setDiffMarker(option)}
                className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-all ${diffMarker === option ? 'bg-white shadow-sm text-black' : 'text-[#57606a] hover:text-black'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* 字体平滑 */}
        <div className="flex justify-between items-center py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-black">字体平滑</div>
            <div className="text-[12px] text-[#57606a] mt-0.5">使用 macOS 原生字体抗锯齿</div>
          </div>
          <Toggle checked={fontSmooth} onChange={() => setFontSmooth(v => !v)} />
        </div>
      </div>

      {/* Program Dock icon selection (Image 3) */}
      <div className="space-y-3">
        <div>
          <h3 className="text-[14px] font-bold text-black">程序坞图标</h3>
          <div className="text-[12px] text-[#57606a] mt-0.5">选择 Codex 在程序坞中使用的图标</div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* 默认 */}
          <div 
            onClick={() => setDockIcon('default')}
            className={`border rounded-xl p-4 flex items-center justify-between cursor-pointer transition-all ${dockIcon === 'default' ? 'border-[#007aff] bg-[#f4f9ff]' : 'border-[#e5e5e5] bg-white hover:bg-[#fafafa]'}`}
          >
            <div className="flex items-center gap-3">
              {/* Blue icon with }_ */}
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow select-none"
                style={{ background: 'linear-gradient(135deg, #5352ed, #3742fa)' }}
              >
                <span className="font-mono text-[16px]">&#125;_</span>
              </div>
              <span className="text-[13px] font-semibold text-black">默认</span>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${dockIcon === 'default' ? 'border-[#007aff]' : 'border-[#ccc]'}`}>
              {dockIcon === 'default' && <div className="w-2 h-2 rounded-full bg-[#007aff]" />}
            </div>
          </div>

          {/* Codex 浅色 */}
          <div 
            onClick={() => setDockIcon('light')}
            className={`border rounded-xl p-4 flex items-center justify-between cursor-pointer transition-all ${dockIcon === 'light' ? 'border-[#007aff] bg-[#f4f9ff]' : 'border-[#e5e5e5] bg-white hover:bg-[#fafafa]'}`}
          >
            <div className="flex items-center gap-3">
              {/* Light blue icon with }_ */}
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow select-none"
                style={{ background: 'linear-gradient(135deg, #70a1ff, #1e90ff)' }}
              >
                <span className="font-mono text-[16px]">&#125;_</span>
              </div>
              <span className="text-[13px] font-semibold text-black">Codex 浅色</span>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${dockIcon === 'light' ? 'border-[#007aff]' : 'border-[#ccc]'}`}>
              {dockIcon === 'light' && <div className="w-2 h-2 rounded-full bg-[#007aff]" />}
            </div>
          </div>

          {/* Codex 深色 */}
          <div 
            onClick={() => setDockIcon('dark')}
            className={`border rounded-xl p-4 flex items-center justify-between cursor-pointer transition-all ${dockIcon === 'dark' ? 'border-[#007aff] bg-[#f4f9ff]' : 'border-[#e5e5e5] bg-white hover:bg-[#fafafa]'}`}
          >
            <div className="flex items-center gap-3">
              {/* Dark grey icon with }_ */}
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow select-none"
                style={{ background: 'linear-gradient(135deg, #2f3542, #57606f)' }}
              >
                <span className="font-mono text-[16px]">&#125;_</span>
              </div>
              <span className="text-[13px] font-semibold text-black">Codex 深色</span>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${dockIcon === 'dark' ? 'border-[#007aff]' : 'border-[#ccc]'}`}>
              {dockIcon === 'dark' && <div className="w-2 h-2 rounded-full bg-[#007aff]" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConfigTab = () => {
  const [approvalPolicy, setApprovalPolicy] = useState('从不');
  const [sandboxSetting, setSandboxSetting] = useState('完全访问');
  const [dependenciesToggle, setDependenciesToggle] = useState(true);

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12">
      <h2 className="text-[20px] font-bold text-black border-b border-[#eee] pb-3 mb-6">配置</h2>
      <div className="text-[13px] text-[#57606a] -mt-4">
        配置审批策略和沙盒设置 <a href="#" className="text-[#007aff] hover:underline">了解更多</a>
      </div>

      {/* 自定义 config.toml 设置 */}
      <div className="space-y-3">
        <h3 className="text-[14px] font-semibold text-black">自定义 config.toml 设置</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm p-4 space-y-4">
          <div className="flex justify-between items-center border-b border-[#f0f0f0] pb-3">
            <select className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[120px] cursor-pointer font-bold text-black">
<option>用户配置</option>
            </select>
            <span className="text-[12px] text-[#007aff] hover:underline cursor-pointer font-semibold">打开 config.toml ↗</span>
          </div>

          <div className="flex justify-between items-center border-b border-[#f0f0f0] pb-3">
            <div>
              <div className="text-[13px] font-semibold text-black">批准策略</div>
              <div className="text-[12px] text-[#57606a] mt-0.5">选择 Codex 何时请求批准</div>
            </div>
            <select 
              value={approvalPolicy}
              onChange={e => setApprovalPolicy(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[140px] cursor-pointer"
            >
              <option>从不</option>
              <option>高危命令</option>
              <option>总是</option>
            </select>
          </div>

          <div className="flex justify-between items-center">
            <div>
              <div className="text-[13px] font-semibold text-black">沙盒设置</div>
              <div className="text-[12px] text-[#57606a] mt-0.5">选择 Codex 的命令执行权限</div>
            </div>
            <select 
              value={sandboxSetting}
              onChange={e => setSandboxSetting(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[140px] cursor-pointer"
            >
              <option>完全访问</option>
              <option>受限沙盒</option>
            </select>
          </div>
        </div>
      </div>

      {/* 工作空间依赖项 */}
      <div className="space-y-3">
        <h3 className="text-[14px] font-semibold text-black">工作空间依赖项</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm p-4 space-y-4">
          <div className="flex justify-between items-center border-b border-[#f0f0f0] pb-3">
            <span className="text-[13px] font-semibold text-black">当前版本</span>
            <span className="text-[13px] text-[#57606a] font-mono font-bold">26.619.11828</span>
          </div>

          <div className="flex justify-between items-center border-b border-[#f0f0f0] pb-3">
            <div>
              <div className="text-[13px] font-semibold text-black">Codex 依赖项</div>
              <div className="text-[12px] text-[#57606a] mt-0.5">允许 Codex 安装并提供随附的 Node.js 和 Python 工具</div>
            </div>
            <Toggle checked={dependenciesToggle} onChange={() => setDependenciesToggle(v => !v)} />
          </div>

          <div className="flex justify-between items-center border-b border-[#f0f0f0] pb-3">
            <div>
              <div className="text-[13px] font-semibold text-black">诊断 Codex 工作空间中的问题</div>
              <div className="text-[12px] text-[#57606a] mt-0.5">检查当前依赖包并记录诊断日志</div>
            </div>
            <button className="flex items-center gap-1.5 bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[12px] font-bold text-black transition-colors">
              <span>🔍</span> 诊断
            </button>
          </div>

          <div className="flex justify-between items-center">
            <div>
              <div className="text-[13px] font-semibold text-black">重置并安装工作空间</div>
              <div className="text-[12px] text-[#57606a] mt-0.5">删除本地捆绑包，重新下载后再重新加载工具</div>
            </div>
            <button className="flex items-center gap-1.5 bg-[#fff0f0] hover:bg-[#ffe5e5] border border-[#ffd0d0] px-3.5 py-1.5 rounded-md text-[12px] font-bold text-red-600 transition-colors">
              <span>📥</span> 重新安装
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const MCPServersTab = () => {
  const [servers, setServers] = useState([
    { name: 'browser-playwright', enabled: true },
    { name: 'context7-local', enabled: true },
    { name: 'firecrawl', enabled: true },
    { name: 'insforge', enabled: true, authRequired: true },
    { name: 'node_repl', enabled: true },
    { name: 'tavily-search', enabled: true },
  ]);

  const toggleServer = (name: string) => {
    setServers(servers.map(s => s.name === name ? { ...s, enabled: !s.enabled } : s));
  };

  const plugins = [
    'aws-mcp',
    'cloudflare-api',
    'codex_apps',
    'computer-use',
    'creative_production_mcp',
    'datascienceWidgets',
    'endor-cli-tools'
  ];

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12">
      <div className="flex justify-between items-center border-b border-[#eee] pb-3.5 mb-2">
        <div>
          <h2 className="text-[20px] font-bold text-black">MCP 服务器</h2>
          <div className="text-[12px] text-[#57606a] mt-1">
            连接外部工具和数据源。<a href="#" className="text-[#007aff] hover:underline">了解更多</a>。
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2 px-1">
          <h3 className="text-[13px] font-bold text-black">服务器</h3>
          <button className="flex items-center gap-1.5 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-2.5 py-1 text-[11px] font-bold hover:bg-[#ebebeb] text-black transition-colors">
            <Plus size={12} /> 添加服务器
          </button>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          {servers.map((server, idx) => (
            <div key={server.name} className={`p-3.5 flex justify-between items-center ${idx !== servers.length - 1 ? 'border-b border-[#eee]' : ''}`}>
              <div className="text-[13px] font-medium font-mono text-black">{server.name}</div>
              <div className="flex items-center gap-4">
                {server.authRequired && (
                  <button className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3 py-1 rounded text-[11px] font-semibold text-black transition-colors">
                    进行身份验证
                  </button>
                )}
                <Settings size={14} className="text-[#aaa] cursor-pointer hover:text-[#555]" />
                <Toggle checked={server.enabled} onChange={() => toggleServer(server.name)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[13px] font-bold text-black mb-2.5 px-1">来自插件</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          {plugins.map((plugin, idx) => (
            <div key={plugin} className={`p-3.5 flex justify-between items-center ${idx !== plugins.length - 1 ? 'border-b border-[#eee]' : ''}`}>
              <span className="text-[13px] font-medium font-mono text-black">{plugin}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BrowserTab = () => {
  const [browserEnabled, setBrowserEnabled] = useState(true);
  const [openDest, setOpenDest] = useState('Codex');
  const [screenshotMode, setScreenshotMode] = useState('始终包含');
  const [approvalMode, setApprovalMode] = useState('始终允许');
  const [cdpEnabled, setCdpEnabled] = useState(true);

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12">
      <div className="border-b border-[#eee] pb-3.5 mb-2">
        <h2 className="text-[20px] font-bold text-black">浏览器</h2>
        <div className="text-[12px] text-[#57606a] mt-1">
          管理 Codex 的浏览器。可在<a href="#" className="text-[#007aff] hover:underline">计算机使用设置</a>中设置 Google Chrome
        </div>
      </div>

      {/* 浏览器总开关 */}
      <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#f5f5f5] flex items-center justify-center text-gray-500 border border-[#e5e5e5]">
            <Globe size={20} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-black">浏览器</div>
            <div className="text-[11px] text-[#57606a] mt-0.5">允许 Codex 控制内置浏览器</div>
          </div>
        </div>
        <Toggle checked={browserEnabled} onChange={() => setBrowserEnabled(!browserEnabled)} />
      </div>

      {/* General */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-2 px-1">General</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm px-4">
          <div className="flex justify-between items-center border-b border-[#eee] py-3.5">
            <div>
              <div className="text-[13px] font-semibold text-black">Default local URL open destination</div>
              <div className="text-[11px] text-[#57606a] mt-0.5">Where localhost and loopback URLs open by default</div>
            </div>
            <select 
              value={openDest}
              onChange={e => setOpenDest(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[12px] outline-none min-w-[120px] cursor-pointer text-black"
            >
              <option>Codex</option>
              <option>System Browser</option>
            </select>
          </div>

          <div className="flex justify-between items-center border-b border-[#eee] py-3.5">
            <div>
              <div className="text-[13px] font-semibold text-black">浏览数据</div>
              <div className="text-[11px] text-[#57606a] mt-0.5">清除应用内浏览器中的网站数据和缓存</div>
            </div>
            <button className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[12px] font-semibold text-black transition-colors shrink-0">
              清除所有浏览数据
            </button>
          </div>

          <div className="flex justify-between items-center py-3.5">
            <div>
              <div className="text-[13px] font-semibold text-black">批注截图</div>
              <div className="text-[11px] text-[#57606a] mt-0.5">截图可帮助 Codex 更好地理解并处理评论，但会增加套餐用量</div>
            </div>
            <select 
              value={screenshotMode}
              onChange={e => setScreenshotMode(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[12px] outline-none min-w-[120px] cursor-pointer text-black"
            >
              <option>始终包含</option>
              <option>从不包含</option>
            </select>
          </div>
        </div>
      </div>

      {/* 权限 */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-2 px-1">权限</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl px-4 shadow-sm">
          <div className="flex justify-between items-center py-3.5">
            <div>
              <div className="text-[13px] font-semibold text-black">审批</div>
              <div className="text-[11px] text-[#57606a] mt-0.5">选择是否 Codex 在打开网站前先请求批准。了解更多</div>
            </div>
            <select 
              value={approvalMode}
              onChange={e => setApprovalMode(e.target.value)}
              className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[12px] outline-none min-w-[120px] cursor-pointer text-black"
            >
              <option>始终允许</option>
              <option>每次询问</option>
            </select>
          </div>
        </div>
      </div>

      {/* 网站权限 */}
      <div>
        <div className="flex justify-between items-center mb-2 px-1">
          <h3 className="text-[13px] font-bold text-black">网站权限</h3>
          <button className="flex items-center gap-1.5 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-2.5 py-1 text-[11px] font-bold hover:bg-[#ebebeb] text-black transition-colors">
            <Plus size={12} /> 添加
          </button>
        </div>
        <div className="bg-[#f9f9f9] border border-[#e5e5e5] rounded-xl p-8 text-center text-[12px] text-[#888] shadow-sm">
          尚无网站专属权限
        </div>
      </div>

      {/* 开发者模式 */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-2 px-1">开发者模式</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 shadow-sm flex justify-between items-center">
          <div>
            <div className="text-[13px] font-semibold text-red-600 flex items-center gap-1">
              <span>⚠️ 风险升高</span>
            </div>
            <div className="text-[13px] font-semibold text-black mt-1">启用完整 CDP 访问权限</div>
            <div className="text-[11px] text-[#57606a] mt-0.5 leading-relaxed">
              允许 Codex 在已连接的 Browser Use 会话中使用完整的 Chrome 开发者工具协议 (CDP) 访问权限。
            </div>
          </div>
          <Toggle checked={cdpEnabled} onChange={() => setCdpEnabled(!cdpEnabled)} />
        </div>
      </div>
    </div>
  );
};

const HooksTab = () => {
  const listItems = [
    { name: 'claude-session-driver', count: 4 },
    { name: 'episodic-memory', count: 1 },
    { name: 'remember', count: 2 },
    { name: 'superpowers', count: 1 },
    { name: 'superpowers', count: 1 },
    { name: 'vercel', count: 3 }
  ];

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12">
      <div className="flex justify-between items-center border-b border-[#eee] pb-3.5 mb-2">
        <div>
          <h2 className="text-[20px] font-bold text-black">钩子</h2>
          <div className="text-[12px] text-[#57606a] mt-1">
            通过配置和已启用的插件管理生命周期钩子。<a href="#" className="text-[#007aff] hover:underline">了解更多</a>
          </div>
        </div>
        <RefreshCw size={14} className="text-[#888] cursor-pointer hover:text-black transition-colors" />
      </div>

      <div>
        <h3 className="text-[13px] font-bold text-black mb-2 px-1">来自配置</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-[#fafafa]">
            <div className="flex items-center gap-3">
              <Settings size={16} className="text-[#888]" />
              <div>
                <div className="text-[13px] font-medium text-black">用户配置</div>
                <div className="text-[11px] text-[#888] mt-0.5">5 个钩子</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-orange-500 font-semibold text-[11px]">
              <AlertCircle size={12} />
              <span>3 个问题</span>
              <span className="text-[#aaa] text-[13px] ml-1">›</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-[13px] font-bold text-black mb-2 px-1">来自插件</h3>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          {listItems.map((hook, idx) => (
            <div key={idx} className={`p-4 flex justify-between items-center cursor-pointer hover:bg-[#fafafa] ${idx !== listItems.length - 1 ? 'border-b border-[#eee]' : ''}`}>
              <div className="flex items-center gap-3">
                <LayoutGrid size={16} className="text-[#888]" />
                <div>
                  <div className="text-[13px] font-medium text-black">{hook.name}</div>
                  <div className="text-[11px] text-[#888] mt-0.5">{hook.count} 个钩子</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-orange-500 font-semibold text-[11px]">
                <AlertCircle size={12} />
                <span>3 个问题</span>
                <span className="text-[#aaa] text-[13px] ml-1">›</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const WorktreeTab = () => {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);

  const fetchThreads = async () => {
    if (window.electronAPI?.thread?.list) {
      try {
        const list = await window.electronAPI.thread.list();
        if (Array.isArray(list)) {
          setThreads(list);
        }
      } catch (err) {
        console.error('Failed to fetch threads/worktrees:', err);
      }
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void fetchThreads();
    });
  }, []);

  const handleRemove = async (id: string, branchName: string) => {
    if (confirm(`确认要删除工作树分支 "${branchName}" 吗？此操作将移除对应的临时文件/工作区。`)) {
      if (window.electronAPI?.thread?.remove) {
        try {
          await window.electronAPI.thread.remove(id);
          void fetchThreads();
        } catch (err) {
          alert('删除失败: ' + String(err));
        }
      }
    }
  };

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12">
      <div className="flex justify-between items-center border-b border-[#eee] pb-3.5 mb-2">
        <h2 className="text-[20px] font-bold text-black">工作树</h2>
        <RefreshCw
          size={14}
          onClick={() => void fetchThreads()}
          className="text-[#888] cursor-pointer hover:text-black transition-colors"
        />
      </div>

      {threads.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-10 text-center shadow-sm max-w-lg mx-auto mt-8">
          <h3 className="text-[14px] font-bold text-black mb-1">尚无活动工作树</h3>
          <p className="text-[12px] text-[#666]">当你使用多分支线程（Thread）时，Codex 创建的临时工作区目录将显示在此处。</p>
        </div>
      ) : (
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm divide-y divide-[#eee]">
          {threads.map(thread => (
            <div key={thread.id} className="p-4 flex justify-between items-center hover:bg-[#fafafa] transition-colors group">
              <div className="min-w-0 pr-4 flex-1">
                <div className="flex items-center gap-2">
                  <span className="bg-[#eff1f3] text-[#57606a] text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase select-none shrink-0">
                    {thread.status || 'Active'}
                  </span>
                  <div className="text-[13px] font-bold text-black truncate" title={thread.name}>{thread.name}</div>
                </div>
                <div className="text-[11px] text-[#57606a] mt-1 font-mono truncate" title={thread.projectPath}>
                  路径: {thread.projectPath}
                </div>
                <div className="text-[11px] text-[#888] mt-0.5">
                  分支: <span className="font-semibold text-black">{thread.branch}</span>
                </div>
              </div>
              <button
                onClick={() => void handleRemove(thread.id, thread.branch || 'main')}
                className="opacity-0 group-hover:opacity-100 hover:bg-[#fff0f0] hover:text-red-600 p-1.5 rounded transition-all text-gray-400 shrink-0 cursor-pointer"
                title="删除工作树"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ArchivedConversationsTab = () => {
  const [showTypeDrop, setShowTypeDrop] = useState(false);
  const [showProjDrop, setShowProjDrop] = useState(false);
  const [typeFilter, setTypeFilter] = useState('全部聊天');
  const [sortMethod, setSortMethod] = useState('更新时间');
  const [projectFilter, setProjectFilter] = useState('All projects');
  const [searchQuery, setSearchQuery] = useState('');

  const [rawSessions, setRawSessions] = useState<ArchivedSessionSummary[]>([]);

  const fetchSessions = async () => {
    if (window.electronAPI?.chat?.getSessions) {
      try {
        const data = await window.electronAPI.chat.getSessions();
        if (Array.isArray(data)) {
          setRawSessions(data);
        }
      } catch (err) {
        console.error('Failed to get real sessions:', err);
      }
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void fetchSessions();
    });
  }, []);

  const chats = useMemo<ArchivedConversationGroup[]>(() => {
    let filtered = [...rawSessions];

    // 1. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => (s.title || '').toLowerCase().includes(q));
    }

    // 2. Project/Branch filter
    if (projectFilter !== 'All projects') {
      filtered = filtered.filter(s => (s.branch || 'main') === projectFilter);
    }

    // 3. Sort method
    if (sortMethod === '更新时间') {
      filtered.sort((a, b) => toSessionTimestamp(b.updatedAt) - toSessionTimestamp(a.updatedAt));
    } else if (sortMethod === '创建时间') {
      filtered.sort((a, b) => toSessionTimestamp(a.updatedAt) - toSessionTimestamp(b.updatedAt));
    } else if (sortMethod === '按字母顺序') {
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    // 4. Categorize by branch/project
    const groups: Record<string, ArchivedConversation[]> = {};
    filtered.forEach(s => {
      const proj = s.branch || 'main';
      if (!groups[proj]) {
        groups[proj] = [];
      }
      groups[proj].push({
        id: s.id,
        title: s.title || '新对话',
        time: new Date(s.updatedAt).toLocaleString('zh-CN', { hour12: false })
      });
    });

    return Object.keys(groups).map(proj => ({
      project: proj,
      count: groups[proj].length,
      conversations: groups[proj]
    }));
  }, [rawSessions, searchQuery, projectFilter, sortMethod]);

  const handleDelete = async (id: string) => {
    if (confirm('确认删除该对话吗？此操作无法撤销。')) {
      if (window.electronAPI?.chat?.deleteSession) {
        const ok = await window.electronAPI.chat.deleteSession(id);
        if (ok) {
          void fetchSessions();
        } else {
          alert('删除失败');
        }
      }
    }
  };

  const handleDeleteAll = async () => {
    if (confirm('确认删除所有已归档对话吗？此操作无法撤销。')) {
      if (window.electronAPI?.chat?.deleteSession) {
        for (const s of rawSessions) {
          await window.electronAPI.chat.deleteSession(s.id);
        }
        void fetchSessions();
      }
    }
  };

  const projectOptions = [
    'All projects',
    ...Array.from(new Set(rawSessions.map(s => s.branch || 'main')))
  ];

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12 relative">
      <div className="flex justify-between items-center border-b border-[#eee] pb-3.5 mb-2">
        <h2 className="text-[20px] font-bold text-black">已归档对话</h2>
        <button 
          onClick={handleDeleteAll}
          className="flex items-center gap-1.5 bg-[#fff0f0] border border-[#ffd0d0] hover:bg-[#ffe5e5] px-3.5 py-1.5 rounded-md text-[12px] font-bold text-red-600 transition-colors"
        >
          <Trash2 size={12} />
          <span>全部删除</span>
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="flex items-center gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-2.5 text-[#888]" />
          <input 
            type="text" 
            placeholder="搜索已归档聊天..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#f5f5f5] border border-[#e5e5e5] rounded-md py-1.5 pl-8 pr-3 text-[12px] outline-none focus:border-[#007aff] transition-colors text-black"
          />
        </div>

        {/* Type Filter */}
        <div className="relative">
          <button 
            onClick={() => setShowTypeDrop(!showTypeDrop)}
            className="flex items-center gap-1 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-2.5 py-1.5 text-[12px] text-black font-semibold cursor-pointer"
          >
            <span>{typeFilter}</span>
            <span className="text-[9px] text-[#888]">▼</span>
          </button>
          {showTypeDrop && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#e5e5e5] rounded-xl shadow-xl z-50 py-2 w-[180px]">
              <div className="px-3 pb-1 text-[10px] text-gray-400 font-bold uppercase">类型</div>
              {['全部聊天', '本地', '云端'].map(option => (
                <div 
                  key={option}
                  onClick={() => { setTypeFilter(option); setShowTypeDrop(false); }}
                  className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer text-[12px] flex items-center justify-between"
                >
                  <span>{option}</span>
                  {typeFilter === option && <Check size={12} className="text-[#007aff]" />}
                </div>
              ))}
              <div className="border-t border-[#eee] my-1"></div>
              <div className="px-3 py-1 text-[10px] text-gray-400 font-bold uppercase">排序方式</div>
              {['更新时间', '创建时间', '按字母顺序'].map(option => (
                <div 
                  key={option}
                  onClick={() => { setSortMethod(option); setShowTypeDrop(false); }}
                  className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer text-[12px] flex items-center justify-between"
                >
                  <span>{option}</span>
                  {sortMethod === option && <Check size={12} className="text-[#007aff]" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Project Filter */}
        <div className="relative">
          <button 
            onClick={() => setShowProjDrop(!showProjDrop)}
            className="flex items-center gap-1 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-2.5 py-1.5 text-[12px] text-black font-semibold cursor-pointer"
          >
            <Folder size={12} className="text-gray-500" />
            <span>{projectFilter}</span>
            <span className="text-[9px] text-[#888]">▼</span>
          </button>
          {showProjDrop && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#e5e5e5] rounded-xl shadow-xl z-50 py-2 w-[220px] max-h-[300px] overflow-y-auto">
              {projectOptions.map(option => (
                <div 
                  key={option}
                  onClick={() => { setProjectFilter(option); setShowProjDrop(false); }}
                  className="px-3 py-1.5 hover:bg-[#f5f5f5] cursor-pointer text-[12px] flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    {option !== 'All projects' && <Folder size={11} className="text-gray-400" />}
                    <span>{option}</span>
                  </div>
                  {projectFilter === option && <Check size={12} className="text-[#007aff]" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat list */}
      <div className="space-y-4">
        {chats.length === 0 ? (
          <div className="text-center py-12 text-[#888] text-[12px]">没有已归档的对话。</div>
        ) : (
          chats.map((group, idx) => (
            <div key={idx} className="bg-white border border-[#e5e5e5] rounded-xl shadow-sm overflow-hidden">
              <div className="bg-[#fafafa] px-4 py-2 border-b border-[#eee] flex justify-between items-center">
                <div className="flex items-center gap-2 text-[12px] font-bold text-black">
                  <Folder size={13} className="text-gray-500" />
                  <span>{group.project}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-500 font-semibold">
                  <span>{group.count} 个聊天</span>
                </div>
              </div>
              <div className="divide-y divide-[#eee]">
                {group.conversations.map((c, cIdx) => (
                  <div key={cIdx} className="p-4 hover:bg-[#fafafa] cursor-pointer transition-colors flex justify-between items-center group">
                    <div className="min-w-0 pr-4 flex-1">
                      <div className="text-[13px] font-semibold text-black leading-snug truncate" title={c.title}>{c.title}</div>
                      <div className="text-[11px] text-[#888] mt-1.5">{c.time}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(c.id); }}
                      className="opacity-0 group-hover:opacity-100 hover:bg-[#fff0f0] hover:text-red-600 p-1.5 rounded transition-all text-gray-400 shrink-0 cursor-pointer"
                      title="删除对话"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const PersonalizationTab = () => {
  const [tone, setTone] = useState(() => localStorage.getItem('codex_tone') || '务实'); // 务实, 亲和
  const [isToneOpen, setIsToneOpen] = useState(false);
  const [customInstructions, setCustomInstructions] = useState(() =>
    localStorage.getItem('codex_custom_instructions') ||
    `# 关于我\n\n叫我"**泽宝**"，你是我的 AI 搭档"**开心**"。\n我是大学生，研究方向是 AI + Java 技术融合。\n英语不太好，用中文沟通。\n性格内向。\n生日：2005年08月15日。\n\n# 协作方式\n\n- 搭档型协作：直接一起写代码、debug、解决问题，不需要过多教学铺垫\n- 需求不明确时：**先追问再动手**，不要自行假设`
  );
  const [isSaved, setIsSaved] = useState(false);
  const [enableMemory, setEnableMemory] = useState(() => localStorage.getItem('codex_enable_memory') !== 'false');
  const [skipToolConv, setSkipToolConv] = useState(() => localStorage.getItem('codex_skip_tool_conv') !== 'false');

  const handleSave = () => {
    localStorage.setItem('codex_custom_instructions', customInstructions);
    localStorage.setItem('codex_tone', tone);
    localStorage.setItem('codex_enable_memory', String(enableMemory));
    localStorage.setItem('codex_skip_tool_conv', String(skipToolConv));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 1500);
  };

  const resetMemory = () => {
    if (confirm('确认要重置并删除所有已收集的 Codex 记忆吗？')) {
      alert('已成功重置记忆。');
    }
  };

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12 relative">
      <h2 className="text-[20px] font-bold text-black border-b border-[#eee] pb-3 mb-6">个性化</h2>

      {/* 个性选项 */}
      <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 shadow-sm flex justify-between items-center relative">
        <div>
          <div className="text-[13px] font-semibold text-black">个性</div>
          <div className="text-[11px] text-[#57606a] mt-0.5">选择 Codex 回复的默认语气</div>
        </div>
        
        <div className="relative">
          <div 
            onClick={() => setIsToneOpen(!isToneOpen)}
            className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] transition-colors rounded-md px-3 py-1.5 text-[12px] outline-none min-w-[140px] cursor-pointer flex items-center justify-between font-semibold text-black"
          >
            <span>{tone}</span>
            <span className="text-[9px] text-[#888] ml-1">▼</span>
          </div>
          {isToneOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#e5e5e5] rounded-xl shadow-xl z-50 py-1.5 w-[200px] text-left">
              <div 
                onClick={() => { setTone('亲和'); setIsToneOpen(false); }}
                className="px-3 py-2 hover:bg-[#f5f5f5] cursor-pointer text-[12px] flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-black">亲和</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">温暖、协作、贴心</div>
                </div>
                {tone === '亲和' && <Check size={12} className="text-[#007aff]" />}
              </div>
              <div 
                onClick={() => { setTone('务实'); setIsToneOpen(false); }}
                className="px-3 py-2 hover:bg-[#f5f5f5] cursor-pointer text-[12px] flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-black">务实</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">简洁、专注、直接</div>
                </div>
                {tone === '务实' && <Check size={12} className="text-[#007aff]" />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 自定义指令 */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-1 px-1">自定义指令</h3>
        <p className="text-[11px] text-[#57606a] mb-2.5 px-1">
          为此主机上的所有任务向 Codex 提供额外说明和上下文。<a href="#" className="text-[#007aff] hover:underline">了解更多</a>
        </p>
        <div className="relative">
          <textarea 
            className="w-full h-[240px] bg-white border border-[#e5e5e5] rounded-xl p-4 text-[12px] font-mono leading-relaxed outline-none focus:border-[#007aff] resize-none shadow-sm text-black"
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
          ></textarea>
          <button 
            onClick={handleSave}
            className="absolute bottom-4 right-4 bg-[#8e8e93] hover:bg-black text-white px-4 py-1.5 rounded-full text-[12px] font-semibold transition-colors shadow-sm"
          >
            {isSaved ? '已保存 ✓' : '保存'}
          </button>
        </div>
      </div>

      {/* 记忆 */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-2 px-1">记忆 (实验性)</h3>
        <p className="text-[11px] text-[#57606a] mb-2.5 px-1">
          设置 Codex 如何收集、保留和整合记忆。<a href="#" className="text-[#007aff] hover:underline">了解更多</a>
        </p>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[13px] font-semibold text-black">启用记忆</div>
              <div className="text-[11px] text-[#57606a] mt-0.5">从聊天中生成新记忆，并将其带入新聊天</div>
            </div>
            <Toggle checked={enableMemory} onChange={() => setEnableMemory(!enableMemory)} />
          </div>
          <div className="p-4 border-b border-[#eee] flex justify-between items-center">
            <div>
              <div className="text-[13px] font-semibold text-black">跳过工具辅助对话</div>
              <div className="text-[11px] text-[#57606a] mt-0.5">请勿从使用了 MCP 工具或网页搜索的对话中生成记忆</div>
            </div>
            <Toggle checked={skipToolConv} onChange={() => setSkipToolConv(!skipToolConv)} />
          </div>
          <div className="p-4 flex justify-between items-center">
            <div>
              <div className="text-[13px] font-semibold text-black">重置记忆</div>
              <div className="text-[11px] text-[#57606a] mt-0.5">删除所有 Codex 记忆</div>
            </div>
            <button 
              onClick={resetMemory}
              className="text-red-500 text-[12px] bg-[#fff0f0] border border-[#ffd0d0] hover:bg-[#ffe5e5] px-3.5 py-1.5 rounded-md font-semibold transition-colors"
            >
              重置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConnectionsTab = () => {
  const [configs, setConfigs] = useState({
    deepseek: {
      apiKey: localStorage.getItem('codex_key_deepseek') || '',
      baseUrl: localStorage.getItem('codex_url_deepseek') || 'https://api.deepseek.com/v1',
      model: localStorage.getItem('codex_model_deepseek') || 'deepseek-v4-flash',
    },
    openai: {
      apiKey: localStorage.getItem('codex_key_openai') || '',
      baseUrl: localStorage.getItem('codex_url_openai') || 'https://api.openai.com/v1',
      model: localStorage.getItem('codex_model_openai') || 'gpt-4o-mini',
    },
    local: {
      apiKey: localStorage.getItem('codex_key_local') || 'lm-studio',
      baseUrl: localStorage.getItem('codex_url_local') || 'http://localhost:1234/v1',
      model: localStorage.getItem('codex_model_local') || 'qwen3.5-9b',
    }
  });

  const [activeTab, setActiveTab] = useState<'deepseek' | 'openai' | 'local'>('deepseek');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState({ deepseek: false, openai: false, local: false });
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleSave = () => {
    const current = configs[activeTab];
    localStorage.setItem(`codex_key_${activeTab}`, current.apiKey);
    localStorage.setItem(`codex_url_${activeTab}`, current.baseUrl);
    localStorage.setItem(`codex_model_${activeTab}`, current.model);
    localStorage.setItem('codex_active_provider', activeTab); // 激活当前模型

    setSaveStatus('保存成功！');
    setTimeout(() => setSaveStatus(null), 1500);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const current = configs[activeTab];
      const api = window.electronAPI;
      if (!api || !api.chat || !api.chat.testConnection) {
        throw new Error('electronAPI.chat.testConnection is not available');
      }
      const res = await api.chat.testConnection({
        provider: activeTab.toUpperCase(),
        customBaseUrl: current.baseUrl,
        customApiKey: current.apiKey,
        model: current.model
      });
      if (res.ok) {
        setTestResult(`连接测试成功，延迟 ${res.delay}ms！`);
      } else {
        setTestResult(`连接测试失败: ${res.error}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setTestResult(`连接测试异常: ${errMsg}`);
    } finally {
      setTesting(false);
    }
  };

  const updateVal = (field: 'apiKey' | 'baseUrl' | 'model', val: string) => {
    setConfigs({
      ...configs,
      [activeTab]: {
        ...configs[activeTab],
        [field]: val
      }
    });
  };

  return (
    <div className="space-y-6 text-[#1f2328] select-none pb-12">
      <div className="border-b border-[#eee] pb-3.5 mb-2">
        <h2 className="text-[20px] font-bold text-black">连接</h2>
        <div className="text-[12px] text-[#57606a] mt-1">
          配置并激活大语言模型厂商，供 Codex 用于核心推理及子智能体。
        </div>
      </div>

      {/* Provider selection tabs */}
      <div className="flex bg-[#f5f5f5] border border-[#e5e5e5] rounded-xl p-0.5">
        {(['deepseek', 'openai', 'local'] as const).map(provider => (
          <button 
            key={provider}
            onClick={() => { setActiveTab(provider); setTestResult(null); }}
            className={`flex-1 py-2 text-[12px] font-bold rounded-lg transition-all capitalize ${activeTab === provider ? 'bg-white shadow-sm text-black' : 'text-[#57606a] hover:text-black'}`}
          >
            {provider === 'local' ? 'Local Qwen' : provider}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#e5e5e5] rounded-xl p-5 shadow-sm space-y-4">
        {/* API Key */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-black flex justify-between">
            <span>API Key</span>
            <span 
              onClick={() => setShowKeys({ ...showKeys, [activeTab]: !showKeys[activeTab] })}
              className="text-[#007aff] cursor-pointer hover:underline font-semibold"
            >
              {showKeys[activeTab] ? '隐藏' : '显示'}
            </span>
          </label>
          <input 
            type={showKeys[activeTab] ? 'text' : 'password'}
            value={configs[activeTab].apiKey}
            onChange={e => updateVal('apiKey', e.target.value)}
            placeholder={activeTab === 'local' ? '本地通常无需 API Key' : '输入大模型厂商提供的 API Key'}
            className="w-full bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3.5 py-2 text-[12px] font-mono outline-none focus:border-[#007aff] text-black"
          />
        </div>

        {/* Base URL */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-black">API Base URL</label>
          <input 
            type="text"
            value={configs[activeTab].baseUrl}
            onChange={e => updateVal('baseUrl', e.target.value)}
            placeholder="例如 https://api.deepseek.com/v1"
            className="w-full bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3.5 py-2 text-[12px] font-mono outline-none focus:border-[#007aff] text-black"
          />
        </div>

        {/* Model Name */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-black">首选模型名称</label>
          <input 
            type="text"
            value={configs[activeTab].model}
            onChange={e => updateVal('model', e.target.value)}
            placeholder="例如 deepseek-v4-flash 或 gpt-4o-mini"
            className="w-full bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3.5 py-2 text-[12px] font-mono outline-none focus:border-[#007aff] text-black"
          />
        </div>

        <div className="border-t border-[#f0f0f0] pt-4 flex justify-between items-center">
          <div className="text-[11px] font-semibold text-green-600">
            {testing ? '正在测试连接中...' : testResult}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleTest}
              disabled={testing}
              className="bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] px-3.5 py-1.5 rounded-md text-[12px] font-semibold text-black transition-colors"
            >
              测试连接
            </button>
            <button 
              onClick={handleSave}
              className="bg-[#007aff] hover:bg-[#0062cc] text-white px-4 py-1.5 rounded-md text-[12px] font-semibold transition-colors"
            >
              {saveStatus ? saveStatus : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
