# Contributing to Connect

Thank you for your interest in contributing to Connect! This document provides guidelines and instructions for contributing.

## Our Philosophy

Connect is built on principles of:
- **Slow, intentional connections** over rapid matching
- **Personality and honesty** over appearance
- **Emotional safety** over engagement metrics
- **Ethical design** over manipulative patterns

When contributing, please align with these values. Question features that prioritize engagement over trust, or speed over depth.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/dating-poc.git
   cd dating-poc
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Set up your environment**:
   - Create a `.env` file (see `.env.example` if available)
   - Set up a PostgreSQL database
   - Run the schema: `psql -U postgres -d your_database -f schema.sql`

## Development Workflow

1. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes** following our code style:
   - Use meaningful variable and function names
   - Add comments for complex logic
   - Keep functions focused and simple
   - Test your changes locally

3. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Description of your changes"
   ```
   
   Commit messages should be clear and descriptive. Examples:
   - `Add photo upload validation`
   - `Fix avatar evolution calculation`
   - `Improve error handling in login route`

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request** on GitHub with:
   - A clear title and description
   - Reference any related issues
   - Explain what changed and why

## Code Guidelines

### Before Adding Features

Ask yourself:
- Does this increase trust or engagement?
- Is this manipulative in any way?
- Does this slow things down or speed them up?
- Would this make users feel psychologically safe?

If a feature feels manipulative or reduces trust, **don't add it**.

### Code Style

- Use clear, descriptive variable names
- Keep functions focused and small
- Add comments for complex business logic
- Follow existing code patterns
- Maintain the calm, humane UI aesthetic

### Database Changes

- Always update `schema.sql` with migrations
- Include both CREATE and ALTER statements
- Test migrations on a copy of production data
- Document breaking changes

### Testing

- Test locally before submitting
- Test edge cases (empty inputs, long strings, etc.)
- Test error scenarios
- Verify no console errors

## What We're Looking For

### Good Contributions

- Bug fixes
- Security improvements
- UI/UX improvements that align with our philosophy
- Performance optimizations
- Documentation improvements
- Accessibility enhancements
- Translation/localization support

### Things We Generally Avoid

- Features that gamify the experience (points, streaks, badges)
- Dark patterns or manipulative UI
- Features that prioritize quantity over quality
- Changes that speed up interactions at the expense of depth
- Appearance-first features

## Reporting Issues

When reporting bugs:

1. **Check existing issues** to avoid duplicates
2. **Use clear titles**: "Avatar doesn't evolve after 10 messages"
3. **Describe the problem**: What happened vs. what should happen
4. **Include steps to reproduce**
5. **Add environment info**: Node version, OS, database version

## Feature Requests

For feature requests:

1. **Open an issue** with the "feature request" label
2. **Explain the "why"**: What problem does this solve?
3. **Consider the philosophy**: How does this align with our values?
4. **Be patient**: We're intentional about additions

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Give constructive feedback
- Focus on the code, not the person
- Respect different perspectives

## Questions?

Open an issue with the "question" label, or start a discussion. We're here to help!

Thank you for helping make Connect better. 🙏
