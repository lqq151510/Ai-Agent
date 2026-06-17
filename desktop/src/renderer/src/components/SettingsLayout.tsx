import { useState } from 'react';
import { Settings, User, Sun, Sliders, Palette, Keyboard, Activity, Link, LayoutGrid, Globe, MousePointer2, GitBranch, TerminalSquare, Archive, ArrowLeft, Search, Plus, RefreshCw } from 'lucide-react';

const SidebarItem = ({ icon: Icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
  <div onClick={onClick} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg cursor-pointer text-[13px] ${active ? 'bg-[#e3e3e3] text-black font-medium' : 'text-[#555] hover:bg-[#ebebeb]'}`}>
    <Icon size={16} strokeWidth={2} className={active ? "text-black" : "text-[#666]"} />
    <span>{label}</span>
  </div>
);

const SidebarSection = ({ title }: { title: string }) => (
  <div className="px-3 pt-4 pb-1 text-[11px] font-semibold text-[#888]">
    {title}
  </div>
);

export const SettingsLayout = ({ onBack }: { onBack: () => void }) => {
  const [activeTab, setActiveTab] = useState('常规');

  const renderContent = () => {
    switch (activeTab) {
      case '配置':
        return <ConfigTab />;
      case 'MCP 服务器':
        return <MCPServersTab />;
      case '钩子':
        return <HooksTab />;
      case '个性化':
        return <PersonalizationTab />;
      case '常规':
      default:
        return <GeneralTab />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[#1a1a1a] font-sans">
      {/* Left Sidebar */}
      <div className="w-[240px] bg-[#f5f5f5] border-r border-[#e5e5e5] flex flex-col shrink-0">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[#555] hover:text-black cursor-pointer text-[13px] font-medium pt-2" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>返回应用</span>
          </div>
          <div className="relative mt-2">
            <Search size={14} className="absolute left-2.5 top-2 text-[#888]" />
            <input 
              type="text" 
              placeholder="搜索设置..." 
              className="w-full bg-white border border-[#ddd] rounded-md py-1.5 pl-8 pr-3 text-[13px] outline-none focus:border-codex-blue transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
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

// ================= TABS =================

const GeneralTab = () => (
  <>
    {/* Top Mode Selection */}
    <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="border-2 border-codex-blue bg-[#f9fbff] rounded-xl p-4 flex justify-between items-center cursor-pointer">
          <div className="flex items-start gap-3">
            <TerminalSquare className="text-codex-blue mt-0.5" size={18} />
            <div>
              <div className="font-medium text-[14px]">适用于编程</div>
              <div className="text-[12px] text-[#666] mt-0.5">更具技术性的回复和控制</div>
            </div>
          </div>
          <div className="w-4 h-4 rounded-full border-4 border-codex-blue bg-white"></div>
        </div>
        
        <div className="border border-[#e5e5e5] bg-white rounded-xl p-4 flex justify-between items-center cursor-pointer hover:bg-[#fafafa]">
          <div className="flex items-start gap-3">
            <Activity className="text-[#888] mt-0.5" size={18} />
            <div>
              <div className="font-medium text-[14px] text-[#333]">适用于日常工作</div>
              <div className="text-[12px] text-[#888] mt-0.5">同样强大，技术细节更少</div>
            </div>
          </div>
          <div className="w-4 h-4 rounded-full border border-[#ccc] bg-white"></div>
        </div>
    </div>

    {/* Section: 权限 */}
    <div className="mb-8">
      <h3 className="text-[14px] font-semibold text-[#333] mb-3 ml-1">权限</h3>
      <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[#eee] flex justify-between items-center">
          <div className="pr-8">
            <div className="text-[14px] font-medium mb-1">默认权限</div>
            <div className="text-[13px] text-[#666]">默认情况下，Codex 可以读取并编辑其工作区中的文件。必要时，它可以请求额外的访问权限。</div>
          </div>
          <Toggle checked={true} />
        </div>
        <div className="p-4 border-b border-[#eee] flex justify-between items-center">
          <div className="pr-8">
            <div className="text-[14px] font-medium mb-1">自动审核</div>
            <div className="text-[13px] text-[#666]">Codex 可以读取和编辑其工作区中的文件。Codex 会自动审核额外访问权限请求。</div>
          </div>
          <Toggle checked={true} />
        </div>
        <div className="p-4 flex justify-between items-center">
          <div className="pr-8">
            <div className="text-[14px] font-medium mb-1">完全访问权限</div>
            <div className="text-[13px] text-[#666]">当 Codex 以完全访问权限运行时，无需你批准，即可编辑你的电脑上的任何文件并运行联网命令。</div>
          </div>
          <Toggle checked={true} />
        </div>
      </div>
    </div>
  </>
);

const ConfigTab = () => (
  <>
    <h2 className="text-[20px] font-semibold mb-1">配置</h2>
    <p className="text-[13px] text-[#666] mb-8">配置审批策略和沙盒设置 <a href="#" className="text-codex-blue hover:underline">了解更多</a></p>

    <h3 className="text-[14px] font-semibold text-[#333] mb-3 ml-1">自定义 config.toml 设置</h3>
    <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm mb-8">
      <div className="p-4 border-b border-[#eee] flex justify-between items-center bg-[#fafafa]">
        <select className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[120px]">
          <option>用户配置</option>
        </select>
        <div className="text-[12px] text-[#888] cursor-pointer hover:text-black">打开 config.toml ↗</div>
      </div>
      <div className="p-4 border-b border-[#eee] flex justify-between items-center">
        <div>
          <div className="text-[14px] font-medium mb-1">批准策略</div>
          <div className="text-[12px] text-[#888]">选择 Codex 何时请求批准</div>
        </div>
        <select className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[160px]">
          <option>从不</option>
        </select>
      </div>
      <div className="p-4 flex justify-between items-center">
        <div>
          <div className="text-[14px] font-medium mb-1">沙盒设置</div>
          <div className="text-[12px] text-[#888]">选择 Codex 的命令执行权限</div>
        </div>
        <select className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[160px]">
          <option>完全访问</option>
        </select>
      </div>
    </div>

    <h3 className="text-[14px] font-semibold text-[#333] mb-3 ml-1">工作空间依赖项</h3>
    <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-[#eee] flex justify-between items-center">
        <div className="text-[14px] font-medium">当前版本</div>
        <div className="text-[13px] text-[#666]">26.614.11602</div>
      </div>
      <div className="p-4 border-b border-[#eee] flex justify-between items-center">
        <div>
          <div className="text-[14px] font-medium mb-1">Codex 依赖项</div>
          <div className="text-[12px] text-[#888]">允许 Codex 安装并提供随附的 Node.js 和 Python 工具</div>
        </div>
        <Toggle checked={true} />
      </div>
      <div className="p-4 border-b border-[#eee] flex justify-between items-center">
        <div>
          <div className="text-[14px] font-medium mb-1">诊断 Codex 工作空间中的问题</div>
          <div className="text-[12px] text-[#888]">检查当前依赖并记录诊断日志</div>
        </div>
        <button className="flex items-center gap-2 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] hover:bg-[#ebebeb]">
          <Search size={14} /> 诊断
        </button>
      </div>
    </div>
  </>
);

const MCPServersTab = () => (
  <>
    <h2 className="text-[20px] font-semibold mb-1">MCP 服务器</h2>
    <p className="text-[13px] text-[#666] mb-8">连接外部工具和数据源。<a href="#" className="text-codex-blue hover:underline">了解更多</a>。</p>

    <div className="flex justify-between items-center mb-3 px-1">
      <h3 className="text-[14px] font-semibold text-[#333]">服务器</h3>
      <button className="flex items-center gap-1.5 bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[12px] font-medium hover:bg-[#ebebeb]">
        <Plus size={14} /> 添加服务器
      </button>
    </div>
    
    <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
      {['browser-playwright', 'context7-local', 'firecrawl', 'insforge', 'node_repl', 'serena', 'tavily-search'].map((server, idx, arr) => (
        <div key={server} className={`p-3.5 flex justify-between items-center ${idx !== arr.length - 1 ? 'border-b border-[#eee]' : ''}`}>
          <div className="text-[13px] font-medium font-mono">{server}</div>
          <div className="flex items-center gap-4">
            <Settings size={14} className="text-[#aaa] cursor-pointer hover:text-[#555]" />
            <Toggle checked={server !== 'serena'} />
          </div>
        </div>
      ))}
    </div>
  </>
);

const HooksTab = () => (
  <>
    <div className="flex justify-between items-center mb-1">
      <h2 className="text-[20px] font-semibold">钩子</h2>
      <RefreshCw size={14} className="text-[#888] cursor-pointer" />
    </div>
    <p className="text-[13px] text-[#666] mb-8">通过配置和已启用的插件管理生命周期钩子。<a href="#" className="text-codex-blue hover:underline">了解更多</a></p>

    <h3 className="text-[14px] font-semibold text-[#333] mb-3 ml-1">来自配置</h3>
    <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm mb-8">
      <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-[#fafafa]">
        <div className="flex items-center gap-3">
          <Settings size={16} className="text-[#888]" />
          <div>
            <div className="text-[13px] font-medium">用户配置</div>
            <div className="text-[12px] text-[#888]">5 个钩子</div>
          </div>
        </div>
        <div className="text-[#aaa]">›</div>
      </div>
    </div>

    <h3 className="text-[14px] font-semibold text-[#333] mb-3 ml-1">来自插件</h3>
    <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
      {[
        { name: 'claude-session-driver', count: 4 },
        { name: 'episodic-memory', count: 1 },
        { name: 'explanatory-output-style', count: 1 },
        { name: 'learning-output-style', count: 1 },
        { name: 'railway', count: 1 },
        { name: 'remember', count: 2 },
      ].map((hook, idx, arr) => (
        <div key={hook.name} className={`p-4 flex justify-between items-center cursor-pointer hover:bg-[#fafafa] ${idx !== arr.length - 1 ? 'border-b border-[#eee]' : ''}`}>
          <div className="flex items-center gap-3">
            <LayoutGrid size={16} className="text-[#888]" />
            <div>
              <div className="text-[13px] font-medium">{hook.name}</div>
              <div className="text-[12px] text-[#888]">{hook.count} 个钩子</div>
            </div>
          </div>
          <div className="text-[#aaa]">›</div>
        </div>
      ))}
    </div>
  </>
);

const PersonalizationTab = () => (
  <>
    <h2 className="text-[20px] font-semibold mb-8">个性化</h2>

    <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm mb-8 p-4 flex justify-between items-center">
      <div>
        <div className="text-[14px] font-medium mb-1">个性</div>
        <div className="text-[12px] text-[#888]">选择 Codex 回复的默认语气</div>
      </div>
      <select className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-md px-3 py-1.5 text-[13px] outline-none min-w-[120px]">
        <option>务实</option>
      </select>
    </div>

    <h3 className="text-[14px] font-semibold text-[#333] mb-1 ml-1">自定义指令</h3>
    <p className="text-[12px] text-[#888] mb-3 ml-1">为此主机上的所有任务向 Codex 提供额外说明和上下文。</p>
    <div className="relative mb-8">
      <textarea 
        className="w-full h-[200px] bg-white border border-[#e5e5e5] rounded-xl p-4 text-[13px] font-mono outline-none focus:border-codex-blue resize-none shadow-sm"
        defaultValue={`# 关于我\n\n叫我"**泽宝**"，你是我的 AI 搭档"**开心**"。\n我是大学生，研究方向是 AI + Java 技术融合。\n英语不太好，用中文沟通。\n\n# 协作方式\n\n- 搭档型协作：直接一起写代码、debug、解决问题`}
      ></textarea>
      <button className="absolute bottom-4 right-4 bg-[#666] text-white px-4 py-1.5 rounded-full text-[13px]">保存</button>
    </div>

    <h3 className="text-[14px] font-semibold text-[#333] mb-1 ml-1">记忆 (实验性)</h3>
    <p className="text-[12px] text-[#888] mb-3 ml-1">设置 Codex 如何收集、保留和整合记忆。</p>
    <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-[#eee] flex justify-between items-center">
        <div>
          <div className="text-[14px] font-medium mb-1">启用记忆</div>
          <div className="text-[12px] text-[#888]">从聊天中生成新记忆，并将其带入新聊天</div>
        </div>
        <Toggle checked={true} />
      </div>
      <div className="p-4 border-b border-[#eee] flex justify-between items-center">
        <div>
          <div className="text-[14px] font-medium mb-1">跳过工具辅助对话</div>
          <div className="text-[12px] text-[#888]">请勿从使用了 MCP 工具或网页搜索的对话中生成记忆</div>
        </div>
        <Toggle checked={true} />
      </div>
      <div className="p-4 flex justify-between items-center">
        <div>
          <div className="text-[14px] font-medium mb-1">重置记忆</div>
          <div className="text-[12px] text-[#888]">删除所有 Codex 记忆</div>
        </div>
        <button className="text-red-500 text-[13px] bg-[#fff0f0] px-3 py-1.5 rounded-md font-medium">重置</button>
      </div>
    </div>
  </>
);

// Toggle Component
const Toggle = ({ checked }: { checked: boolean }) => (
  <div className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${checked ? 'bg-[#007aff]' : 'bg-[#e5e5e5]'}`}>
    <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`}></div>
  </div>
);
