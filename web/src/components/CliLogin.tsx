import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Tokens, UserProfile } from '../types';

interface CliLoginProps {
  tokens: Tokens | null;
  user: UserProfile | null;
}

export function CliLogin({ tokens, user }: CliLoginProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const cliPort = searchParams.get('cliPort');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!cliPort) {
      setStatus('error');
      return;
    }

    if (!tokens || !user) {
      // Not logged in, redirect to login page with returnTo
      navigate(`/login?returnTo=${encodeURIComponent(`/cli-login?cliPort=${cliPort}`)}`);
      return;
    }

    // Hit the local server
    const url = `http://127.0.0.1:${cliPort}/callback?accessToken=${encodeURIComponent(tokens.accessToken)}&refreshToken=${encodeURIComponent(tokens.refreshToken)}`;
    fetch(url)
      .then((res) => {
        if (res.ok) {
          setStatus('success');
        } else {
          setStatus('error');
        }
      })
      .catch(() => {
        setStatus('error');
      });
  }, [cliPort, tokens, user, navigate]);

  if (!cliPort) {
    return <div className="p-8 text-center text-red-500">Missing cliPort in URL.</div>;
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#1E1E1E] text-white font-sans">
      <div className="max-w-md rounded-lg border border-gray-700 bg-[#252526] p-8 text-center shadow-xl">
        <h1 className="mb-4 text-2xl font-bold text-blue-400">CLI 网页端授权</h1>
        {status === 'loading' && (
          <p className="text-gray-300">正在与本地终端进行连接并发送令牌，请稍候...</p>
        )}
        {status === 'success' && (
          <div className="text-green-400">
            <svg
              className="mx-auto mb-4 h-16 w-16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-lg font-semibold">授权登录成功！</p>
            <p className="mt-2 text-sm text-gray-400">
              您可以安全地关闭此页面，返回到您的终端继续使用 CLI。
            </p>
          </div>
        )}
        {status === 'error' && (
          <div className="text-red-400">
            <svg
              className="mx-auto mb-4 h-16 w-16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="text-lg font-semibold">授权失败</p>
            <p className="mt-2 text-sm text-gray-400">
              请检查本地终端是否已关闭或出现网络错误。您可以关闭此页面并在终端中重试 /login 命令。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
