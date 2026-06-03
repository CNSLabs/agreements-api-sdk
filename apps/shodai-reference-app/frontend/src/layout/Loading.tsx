import React from 'react';
import { Spinner } from '@/components/spinner';

const Loading: React.FC = () => {
  return (
    <div className="flex h-full min-h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" />
      </div>
    </div>
  );
};

export default Loading;
