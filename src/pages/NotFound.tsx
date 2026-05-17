import { Link } from 'react-router-dom'
import { Warning, House } from '@phosphor-icons/react'
import { useTheme } from '../context/ThemeContext'
import ROUTES from '../lib/routes'

function NotFound() {
  useTheme()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-yellow-100 dark:bg-yellow-900/30 p-5 rounded-full">
            <Warning size={48} weight="duotone" className="text-yellow-500" />
          </div>
        </div>
        <h1 className="text-8xl font-bold text-gray-200 dark:text-gray-700 mb-2">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-2">Page Not Found</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center gap-2 py-2 px-6 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <House size={18} />
          Back to Home
        </Link>
      </div>
    </div>
  )
}

export default NotFound